/**
 * Браузерный QA-прогон ЮгАкцент (Playwright): каждая страница на 375, 768 и 1280 px.
 *
 * Запуск (из корня репозитория):
 *   node deploy/yugaktsent/qa/browser-qa.mjs                 — публичные страницы прода
 *   QA_ADMIN_BASE=http://localhost:5173 node …/browser-qa.mjs — плюс админка через dev-сервер
 *     в staging-режиме (демо-вход, на прод ничего не пишется)
 *   QA_BASE=QA_ADMIN_BASE=http://localhost:5173 + QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD — всё через
 *     локальный API с тестовой базой (вход тестовым админом)
 *
 * Проверяет: HTTP-статус, ошибки консоли, упавшие запросы, горизонтальный скролл,
 * битые картинки, экран ошибки, слишком мелкие кнопки на телефоне.
 * Результат: qa-artifacts/<дата>/report.json и скриншоты (каталог в .gitignore).
 */
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** playwright стоит транзитивно (через pnpm), поэтому ищем его и в .pnpm */
function loadPlaywright() {
  const require = createRequire(join(process.cwd(), "package.json"));
  try {
    return require("playwright");
  } catch {
    const store = join(process.cwd(), "node_modules/.pnpm");
    const dir = readdirSync(store).filter((d) => /^playwright@\d/.test(d)).sort().pop();
    if (!dir) throw new Error("playwright не найден: pnpm add -D -w playwright");
    return require(join(store, dir, "node_modules/playwright"));
  }
}
const { chromium } = loadPlaywright();

const BASE = (process.env.QA_BASE || "https://yugaktsent.neeklo.ru").replace(/\/$/, "");
const ADMIN_BASE = process.env.QA_ADMIN_BASE?.replace(/\/$/, "");
const OUT_DIR = join(process.cwd(), "qa-artifacts", new Date().toISOString().slice(0, 10));
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];
const ERROR_MARKERS = ["Что-то пошло не так", "Something went wrong", "Unexpected Application Error"];

async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function publicRoutes() {
  const routes = [
    { path: "/", name: "Главная" },
    { path: "/catalog", name: "Каталог" },
    { path: "/catalog?group=flats", name: "Каталог квартир" },
    { path: "/map", name: "Карта" },
    { path: "/favorites", name: "Избранное" },
    { path: "/contacts", name: "Контакты" },
    { path: "/about", name: "О компании" },
    { path: "/news", name: "Новости" },
    { path: "/privacy", name: "Политика" },
    { path: "/terms", name: "Условия" },
    { path: "/cookies", name: "Cookies" },
    { path: "/login", name: "Вход" },
    { path: "/no-such-page-qa", name: "404", expect404: true },
  ];
  const blocks = await api("/blocks?per_page=20");
  for (const b of blocks.data ?? blocks) routes.push({ path: `/complex/${b.slug}`, name: `ЖК ${b.name}` });
  const listings = await api("/listings?per_page=1&kind=APARTMENT").catch(() => null);
  const first = listings?.data?.[0];
  if (first) routes.push({ path: `/apartment/${first.id}`, name: "Квартира" });
  const experts = ["vladislav-goncharov"];
  for (const s of experts) routes.push({ path: `/experts/${s}`, name: "Эксперт" });
  return routes.map((r) => ({ ...r, base: BASE }));
}

function adminRoutes() {
  const paths = [
    "", "listings", "blocks", "buildings", "builders", "feed-links", "feed-import", "requests",
    "news", "experts", "media", "homepage", "banners", "settings", "users", "pages", "regions",
  ];
  return paths.map((p) => ({ path: `/admin/${p}`.replace(/\/$/, ""), name: `Админка ${p || "главная"}`, base: ADMIN_BASE, admin: true }));
}

/**
 * Токены для админки: с QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD — настоящий вход (локальный API
 * с тестовой базой), иначе демо-токен staging-режима dev-сервера.
 */
async function adminTokens() {
  const email = process.env.QA_ADMIN_EMAIL;
  const password = process.env.QA_ADMIN_PASSWORD;
  if (!email || !password) return { access: "staging-demo-token", refresh: "staging-demo-token" };
  const res = await fetch(`${ADMIN_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`вход в админку: HTTP ${res.status}`);
  const body = await res.json();
  return { access: body.accessToken, refresh: body.refreshToken };
}
const ADMIN_TOKENS = ADMIN_BASE ? await adminTokens() : null;

async function checkPage(browser, route, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
  if (route.admin) {
    await context.addInitScript((t) => {
      localStorage.setItem("lg_access_token", t.access);
      localStorage.setItem("lg_refresh_token", t.refresh);
    }, ADMIN_TOKENS);
  }
  const page = await context.newPage();
  const consoleErrors = [];
  const failed = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && !u.includes("mc.yandex") && !u.endsWith("/favicon.ico")) failed.push(`${r.status()} ${u.slice(0, 160)}`);
  });

  const started = Date.now();
  let status = 0;
  try {
    const res = await page.goto(route.base + route.path, { waitUntil: "networkidle", timeout: 45_000 });
    status = res?.status() ?? 0;
  } catch (e) {
    consoleErrors.push(`goto: ${e.message.slice(0, 120)}`);
  }
  const loadMs = Date.now() - started;
  // Прокрутка — чтобы подгрузились ленивые картинки
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(800);

  const dom = await page.evaluate(({ markers, mobile }) => {
    const vw = document.documentElement.clientWidth;
    const overflowers = [...document.querySelectorAll("body *")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed"; })
      .filter((el) => !el.closest("[data-qa-scroll-x], .overflow-x-auto, .overflow-x-scroll, .overflow-hidden, .overflow-x-hidden"))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => i.currentSrc || i.src).slice(0, 5);
    const smallTargets = mobile
      ? [...document.querySelectorAll("a[href], button, [role=button], input, select")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            if (r.width <= 1 || r.height <= 1 || s.visibility === "hidden") return false; // sr-only, «к содержимому»
            if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) return false; // кликается подпись
            if (el.tagName === "A" && s.display === "inline" && el.parentElement?.closest("p, li, label, small")) return false; // ссылка в тексте
            return r.height < 24 || r.width < 24;
          })
          .map((el) => `${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30) || el.outerHTML.slice(0, 60)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`)
          .slice(0, 8)
      : [];
    const text = document.body.innerText;
    return {
      title: document.title,
      hScroll: document.documentElement.scrollWidth > vw + 1,
      overflowers,
      broken,
      smallTargets,
      errorScreen: markers.find((m) => text.includes(m)) ?? null,
      h1: document.querySelectorAll("h1").length,
      metro: /метро/i.test(text),
    };
  }, { markers: ERROR_MARKERS, mobile: vp.width < 768 }).catch((e) => ({ evalError: e.message }));

  const slug = `${route.path.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "") || "home"}-${vp.name}.png`;
  await page.screenshot({ path: join(OUT_DIR, slug), fullPage: true }).catch(() => {});
  await context.close();

  const problems = [];
  const okStatus = route.expect404 ? status === 404 || status === 200 : status > 0 && status < 400;
  if (!okStatus) problems.push(`HTTP ${status}`);
  if (dom.hScroll) problems.push(`горизонтальный скролл: ${dom.overflowers.join(", ")}`);
  if (dom.broken?.length) problems.push(`битые картинки: ${dom.broken.length}`);
  if (dom.errorScreen) problems.push(`экран ошибки: ${dom.errorScreen}`);
  if (dom.metro) problems.push("слово «метро» на странице");
  if (!route.admin && !route.expect404 && dom.h1 !== 1) problems.push(`h1 на странице: ${dom.h1}`);
  const warnings = [];
  if (consoleErrors.length) warnings.push(`консоль: ${consoleErrors.length}`);
  if (failed.length) warnings.push(`запросы с ошибкой: ${failed.length}`);
  if (dom.smallTargets?.length) warnings.push(`мелкие кнопки: ${dom.smallTargets.length}`);

  return { route: route.path, name: route.name, viewport: vp.name, status, loadMs, title: dom.title, problems, warnings, consoleErrors, failed, smallTargets: dom.smallTargets, screenshot: slug };
}

const routes = [...(await publicRoutes()), ...(ADMIN_BASE ? adminRoutes() : [])];
mkdirSync(OUT_DIR, { recursive: true });
// QA_CHROME=chrome — установленный Google Chrome, если браузеры Playwright не скачаны
const browser = await chromium.launch(process.env.QA_CHROME ? { channel: process.env.QA_CHROME } : {});
const results = [];
for (const route of routes) {
  for (const vp of VIEWPORTS) {
    const r = await checkPage(browser, route, vp);
    results.push(r);
    const mark = r.problems.length ? "FAIL" : r.warnings.length ? "WARN" : "OK  ";
    console.log(`${mark} ${vp.name.padEnd(7)} ${route.path} ${r.loadMs}ms ${[...r.problems, ...r.warnings].join("; ")}`);
  }
}
await browser.close();

const summary = {
  base: BASE,
  adminBase: ADMIN_BASE ?? null,
  at: new Date().toISOString(),
  checks: results.length,
  ok: results.filter((r) => !r.problems.length && !r.warnings.length).length,
  warn: results.filter((r) => !r.problems.length && r.warnings.length).length,
  fail: results.filter((r) => r.problems.length).length,
};
writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify({ summary, results }, null, 2));
console.log(`\n${summary.ok} OK, ${summary.warn} WARN, ${summary.fail} FAIL → ${OUT_DIR}/report.json`);
process.exitCode = summary.fail ? 1 : 0;
