/**
 * После `vite build`: встраивает title/description/canonical/og в HTML для SEO
 * и создаёт вложенные index.html (nginx try_files $uri/ → catalog/index.html и т.д.).
 *
 * Env:
 *   VITE_PUBLIC_SITE_URL | PUBLIC_SITE_URL — базовый URL сайта (без слэша в конце)
 *   PRERENDER_API_BASE — URL API для выборки ЖК (по умолчанию SITE + /api/v1)
 *   SKIP_PRERENDER=1 — пропустить (оставить только корневой index как после Vite)
 *   PRERENDER_MAX_COMPLEX — макс. число страниц /complex/* (по умолчанию 500)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

function trimSlash(u) {
  return String(u || '').replace(/\/+$/, '');
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainFromMaybeHtml(s, maxLen) {
  if (!s) return '';
  const t = String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** @param {string} html @param {{ title: string; description: string; canonical: string; robots?: string }} p */
function patchHtmlHead(html, p) {
  let out = html;
  /* Удаляем «хвост» от старых прогонов: robots/canonical перед </head> после script */
  out = out.replace(
    /\s*<meta\s+name="robots"[^>]+>\s*\n?\s*<link\s+rel="canonical"[^>]+>(?=\s*\n?\s*<\/head>)/gi,
    '',
  );
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(p.title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*>/i,
    `<meta name="description" content="${escapeAttr(p.description)}">`,
  );
  const robots = p.robots || 'index, follow';
  const robotsTag = `<meta name="robots" content="${escapeAttr(robots)}">`;
  const canonTag = `<link rel="canonical" href="${escapeAttr(p.canonical)}">`;
  if (/<meta\s+name="robots"/i.test(out)) {
    out = out.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      robotsTag,
    );
  } else if (/<meta\s+charset/i.test(out)) {
    out = out.replace(/<meta\s+charset[^>]+>/i, (m) => `${m}\n    ${robotsTag}`);
  } else {
    out = out.replace(/<head>/i, `<head>\n    ${robotsTag}`);
  }
  if (/<link\s+rel="canonical"/i.test(out)) {
    out = out.replace(/<link\s+rel="canonical"[^>]*>/i, canonTag);
  } else {
    out = out.replace(/(<meta\s+name="robots"\s+content="[^"]*"\s*\/?>)/i, `$1\n    ${canonTag}`);
  }
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*>/i,
    `<meta property="og:title" content="${escapeAttr(p.title)}">`,
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*>/i,
    `<meta property="og:description" content="${escapeAttr(p.description)}">`,
  );
  if (/property="og:url"/i.test(out)) {
    out = out.replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${escapeAttr(p.canonical)}">`,
    );
  } else {
    out = out.replace(
      /<meta\s+property="og:type"[^>]*>/i,
      (m) => `${m}\n    <meta property="og:url" content="${escapeAttr(p.canonical)}">`,
    );
  }
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*>/i,
    `<meta name="twitter:title" content="${escapeAttr(p.title)}">`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*>/i,
    `<meta name="twitter:description" content="${escapeAttr(p.description)}">`,
  );
  return out;
}

function writeHtml(relDir, baseHtml, patch) {
  const dir = path.join(distDir, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const html = patchHtmlHead(baseHtml, patch);
  writeAtomic(path.join(dir, 'index.html'), html);
}


/* ─── Preload картинки первого экрана (LCP) ───
 * Приложение находит обложку только после цепочки запросов (настройки → регионы → ЖК),
 * поэтому кладём <link rel="preload"> с тем же srcset, что у <img> (логика image-media.ts). */
const IMAGE_WIDTHS = [480, 800, 1280];
const PROFITBASE_RE = /^https?:\/\/(pb\d+(?:\.tochno)?)\.profitbase\.ru\/(uploads\/.+)$/i;
const LOCAL_UPLOAD_RE = /^(?:https?:\/\/[^/]+)?\/(uploads\/.+\.(?:jpe?g|png|webp))$/i;

function proxiedUrl(url, width, siteHost) {
  if (process.env.VITE_IMAGE_PROXY !== '1') return null;
  const u = String(url || '').trim();
  const m = PROFITBASE_RE.exec(u);
  if (m) return `/img/${width}/${m[1]}/${m[2]}`;
  if (process.env.VITE_IMAGE_PROXY_LOCAL !== '1') return null;
  const l = LOCAL_UPLOAD_RE.exec(u);
  if (!l) return null;
  let own = u.startsWith('/');
  try { own = own || new URL(u).host === siteHost; } catch { /* относительный адрес */ }
  return own ? `/img/${width}/local/${l[1]}` : null;
}

function preloadImageTag(url, sizes, siteHost) {
  const parts = IMAGE_WIDTHS.map((w) => proxiedUrl(url, w, siteHost));
  if (!parts.every(Boolean)) {
    return /^https?:\/\//.test(url) ? `<link rel="preload" as="image" href="${escapeAttr(url)}" fetchpriority="high">` : '';
  }
  const srcset = parts.map((u, i) => `${u} ${IMAGE_WIDTHS[i]}w`).join(', ');
  return `<link rel="preload" as="image" href="${escapeAttr(parts[1])}" imagesrcset="${escapeAttr(srcset)}" imagesizes="${escapeAttr(sizes)}" fetchpriority="high">`;
}

function injectHead(html, tag) {
  return tag ? html.replace(/<\/head>/i, `    ${tag}\n  </head>`) : html;
}

async function defaultRegionId(apiBase) {
  const code = String(process.env.VITE_DEFAULT_REGION_CODE || '').trim().toLowerCase();
  const regions = await fetchJson(`${apiBase}/regions`);
  const region = (Array.isArray(regions) ? regions : regions.data || []).find((r) => String(r.code).toLowerCase() === code);
  return region ? region.id : null;
}

/** Обложка первой карточки каталога ЖК — тот же запрос, что делает каталог по умолчанию */
async function catalogFirstImage(apiBase) {
  const id = await defaultRegionId(apiBase);
  if (id == null) return null;
  const j = await fetchJson(`${apiBase}/blocks?region_id=${id}&page=1&per_page=20&sort=price_asc`);
  const first = (j.data || [])[0];
  return first?.images?.[0]?.url || null;
}

/** Обложка первого слайда главной — как в HeroBanner: баннеры из настроек, иначе первый ЖК города по умолчанию с фото */
async function homeHeroImage(apiBase) {
  try {
    const settings = await fetchJson(`${apiBase}/content/settings`);
    const all = Object.values(settings || {}).flat();
    const raw = all.find((x) => x?.key === 'home_banners')?.value;
    const banners = JSON.parse(raw || '[]');
    const first = Array.isArray(banners)
      ? banners.find((b) => b && b.enabled !== false && (b.image || b.title || b.subtitle || b.tag))
      : null;
    if (first) return String(first.image || '').trim() || null;
  } catch { /* нет настроек — идём к ЖК */ }
  const code = String(process.env.VITE_DEFAULT_REGION_CODE || '').trim().toLowerCase();
  const regions = await fetchJson(`${apiBase}/regions`);
  const region = (Array.isArray(regions) ? regions : regions.data || []).find((r) => String(r.code).toLowerCase() === code);
  if (!region) return null;
  const sp = new URLSearchParams({ region_id: String(region.id), per_page: '24', page: '1', sort: 'created_desc', require_active_listings: 'true' });
  const j = await fetchJson(`${apiBase}/blocks?${sp}`);
  const b = (j.data || []).find((row) => row?.images?.[0]?.url && row.slug);
  return b ? b.images[0].url : null;
}


/* ─── Разметка первого экрана (SSR при сборке) ───
 * dist-ssr/prerender-entry.mjs (vite build --config vite.ssr.config.ts) рендерит те же React-страницы
 * с данными. Разметка кладётся в #ssr-shell (приложение убирает его, когда отрисует страницу),
 * данные — в window.__YUG_RQ__ (кэш React Query). Крупные запросы (списки квартир) не встраиваем. */
const SSR_QUERY_MAX_BYTES = 20 * 1024;

async function loadSsr(apiBase) {
  const entry = path.resolve(__dirname, '../dist-ssr/prerender-entry.mjs');
  if (process.env.SKIP_SSR === '1' || !fs.existsSync(entry)) {
    console.log('[prerender-seo] SSR-разметка пропущена (нет dist-ssr или SKIP_SSR=1).');
    return null;
  }
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
  };
  globalThis.localStorage ??= mem();
  globalThis.sessionStorage ??= mem();
  globalThis.__SSR_API_ORIGIN__ = new URL(apiBase).origin;
  const mod = await import(pathToFileURL(entry).href);
  return mod.render;
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * В оболочке грузится только картинка первого экрана (её же отдаёт preload): у остальных <img>
 * убираем src/srcset, иначе 20+ фото каруселей и планировок стартуют одновременно с главной
 * и отнимают у неё канал. Приложение через мгновение отрисует их со своей ленивой загрузкой.
 */
function keepOnlyLcpImage(markup, keepPath) {
  // <picture><source srcset> грузит файл сам по себе — в оболочке его тоже не нужно
  markup = markup.replace(/<source\b[^>]*>/gi, (tag) => tag.replace(/\s(srcset|srcSet|sizes)="[^"]*"/gi, ''));
  return markup.replace(/<img\b[^>]*>/g, (tag) => {
    const src = (tag.match(/\ssrc="([^"]*)"/) || [])[1] || '';
    if (keepPath && src === keepPath) return tag;
    // Логотипы в шапке и подвале — маленькие, без них шапка мигнёт
    if (/^\/logo-[\w-]+\.(png|svg|webp)$/.test(src)) return tag;
    return tag
      .replace(/\s(src|srcset|srcSet|sizes)="[^"]*"/g, '')
      .replace(/^<img/, `<img data-ssr-src="${src.replace(/"/g, '&quot;')}"`);
  });
}

/**
 * Вырезает из оболочки секции ниже первого экрана (<section id="…"> с учётом вложенных section).
 * Шахматка и планировки — сотни элементов: их разбор и вёрстка в оболочке занимали главный поток,
 * а приложение всё равно перерисует их через мгновение.
 */
function dropSections(markup, ids) {
  let out = markup;
  for (const id of ids) {
    const open = new RegExp(`<section\\b[^>]*\\sid="${id}"[^>]*>`);
    const m = open.exec(out);
    if (!m) continue;
    const re = /<section\b[^>]*>|<\/section>/g;
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = re.exec(out); t; t = re.exec(out)) {
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end > 0) out = out.slice(0, m.index) + out.slice(end);
  }
  return out;
}

const SHELL_DROP_SECTIONS = ['layouts', 'chessboard', 'plans', 'lead', 'similar'];

function preloadHref(tag) {
  return (String(tag || '').match(/\shref="([^"]*)"/) || [])[1]?.replace(/&amp;/g, '&') || null;
}

async function withShell(render, html, url, keepPath = null) {
  if (!render) return html;
  try {
    const r = await render(url);
    r.html = keepOnlyLcpImage(dropSections(r.html, SHELL_DROP_SECTIONS), keepPath);
    if (r.failed.length) console.warn(`[prerender-seo] SSR ${url}: не загрузились ${r.failed.length} запросов`);
    const queries = (r.state.queries || []).filter((q) => JSON.stringify(q).length <= SSR_QUERY_MAX_BYTES);
    const state = { ...r.state, queries };
    // Оболочка стоит перед #root; загрузочная заглушка внутри #root при ней не нужна
    const block =
      `<style>#ssr-shell~#root>.boot-header,#ssr-shell~#root>.boot-hero{display:none}</style>\n    ` +
      `<div id="ssr-shell">${r.html}</div>\n    ` +
      `<script>window.__YUG_RQ__=${jsonForScript(state)}</script>\n    `;
    console.log(`[prerender-seo] SSR ${url}: разметка ${Math.round(r.html.length / 1024)} КБ, данные ${Math.round(jsonForScript(state).length / 1024)} КБ (${queries.length} запросов)`);
    return html.replace(/<div id="root">/, (m) => `${block}${m}`);
  } catch (e) {
    console.warn(`[prerender-seo] SSR ${url} пропущен: ${e.message}`);
    return html;
  }
}

function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

function writeRaw(relDir, html) {
  const dir = path.join(distDir, relDir);
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, 'index.html'), html);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LiveGrid-Prerender/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadBlockSlugs(apiBase, maxComplex) {
  const slugs = [];
  const seen = new Set();
  let page = 1;
  let totalPages = 1;
  const perPage = 100;
  while (page <= totalPages && slugs.length < maxComplex) {
    const url = `${apiBase}/blocks?page=${page}&per_page=${perPage}`;
    const j = await fetchJson(url);
    totalPages = Math.max(1, Number(j.meta?.total_pages) || 1);
    const rows = j.data || [];
    if (!rows.length) break;
    for (const row of rows) {
      if (!row?.slug || seen.has(row.slug)) continue;
      if (row.slug.includes('..') || row.slug.includes('/') || row.slug.includes('\\')) continue;
      seen.add(row.slug);
      slugs.push({ slug: row.slug, name: row.name || row.slug, description: row.description || '', cover: row.images?.[0]?.url || null });
      if (slugs.length >= maxComplex) break;
    }
    page += 1;
  }
  return slugs;
}

function buildSitemapXml(siteUrl, complexPaths, extraPaths = []) {
  const staticPaths = [
    '/',
    '/catalog',
    '/catalog/apartments',
    // Дома, участки и коммерция пока пустые — пустые разделы в sitemap не отдаём
    '/map',
    '/news',
    '/about',
    '/contacts',
    '/privacy',
    '/terms',
    '/cookies',
    ...extraPaths,
  ];
  const urls = [];
  for (const p of staticPaths) {
    urls.push({ loc: `${siteUrl}${p}`, changefreq: p === '/' ? 'daily' : 'weekly', priority: p === '/' ? '1.0' : '0.7' });
  }
  for (const slug of complexPaths) {
    urls.push({
      loc: `${siteUrl}/complex/${encodeURIComponent(slug)}`,
      changefreq: 'weekly',
      priority: '0.85',
    });
  }
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function main() {
  if (process.env.SKIP_PRERENDER === '1') {
    console.log('[prerender-seo] SKIP_PRERENDER=1 — пропуск.');
    return;
  }

  const siteUrl = trimSlash(process.env.VITE_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://yugaktsent.neeklo.ru');
  const siteBrand = (process.env.VITE_DEFAULT_BRAND || process.env.SITE_BRAND || 'ЮгАкцент').trim();
  const sitemapIndexUrl = `${siteUrl}/api/v1/sitemap/sitemap-index.xml`;
  const apiBase = trimSlash(process.env.PRERENDER_API_BASE || `${siteUrl}/api/v1`);
  const maxComplex = Math.max(1, Math.min(5000, Number(process.env.PRERENDER_MAX_COMPLEX) || 500));

  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('[prerender-seo] Нет dist/index.html. Сначала выполните vite build.');
    process.exit(1);
  }
  // Чистый шаблон Vite храним отдельно: скрипт перезапускается на сервере после синхронизации
  // фидов, а index.html к тому моменту уже пропатчен
  const templatePath = path.join(distDir, 'spa-template.html');
  if (!fs.existsSync(templatePath)) fs.copyFileSync(indexPath, templatePath);
  const baseHtml = fs.readFileSync(templatePath, 'utf8');
  const ssr = await loadSsr(apiBase);

  const homeTitle = `${siteBrand} — новостройки и квартиры в Анапе и Майкопе`;
  const homeDesc = 'Агентство недвижимости «Южный Акцент» в Анапе: новостройки Анапы и Майкопа с актуальными ценами застройщиков, подбор, консультация и показ.';
  // Главную собираем в памяти и пишем одним атомарным rename — nginx не отдаст полуготовый файл
  let homeHtml = patchHtmlHead(baseHtml, {
    title: homeTitle,
    description: homeDesc,
    canonical: `${siteUrl}/`,
  });
  const siteHost = new URL(siteUrl).host;
  let homeKeep = null;
  try {
    const hero = await homeHeroImage(apiBase);
    const tag = hero ? preloadImageTag(hero, '100vw', siteHost) : '';
    homeKeep = preloadHref(tag);
    if (tag) {
      homeHtml = injectHead(homeHtml, tag);
      console.log(`[prerender-seo] preload героя главной: ${hero}`);
    }
  } catch (e) {
    console.warn(`[prerender-seo] preload героя пропущен (${e.message}).`);
  }
  writeAtomic(indexPath, await withShell(ssr, homeHtml, '/', homeKeep));

  let catalogPreload = '';
  try {
    const img = await catalogFirstImage(apiBase);
    catalogPreload = img ? preloadImageTag(img, '(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 46vw, 86vw', siteHost) : '';
  } catch (e) {
    console.warn(`[prerender-seo] preload каталога пропущен (${e.message}).`);
  }
  writeRaw(
    'catalog',
    await withShell(
      ssr,
      patchHtmlHead(injectHead(baseHtml, catalogPreload), {
        title: `Каталог недвижимости | ${siteBrand}`,
        description: 'Подбор ЖК и квартир по цене, району, метро и другим параметрам.',
        canonical: `${siteUrl}/catalog`,
      }),
      '/catalog',
      preloadHref(catalogPreload),
    ),
  );

  // Статические страницы: свой title/description/canonical прямо в HTML, без JS
  const STATIC_PAGES = [
    ['about', `О компании | ${siteBrand}`, `${siteBrand}, агентство недвижимости в Анапе: подбор новостроек Анапы и Майкопа, проверка документов, сопровождение сделки и помощь с ипотекой.`],
    ['contacts', `Контакты | ${siteBrand}`, `Офис ${siteBrand} в Анапе: адрес на карте, телефоны, мессенджеры. Консультация по подбору новостроек бесплатная.`],
    ['news', `Новости недвижимости | ${siteBrand}`, 'Новости рынка недвижимости Анапы и Майкопа, проектов и застройщиков.'],
    ['map', `Новостройки на карте | ${siteBrand}`, 'Жилые комплексы Анапы и Майкопа на карте: цены, сроки сдачи и квартиры в продаже.'],
    ['privacy', `Политика обработки персональных данных | ${siteBrand}`, `Какие персональные данные обрабатывает сайт ${siteBrand}, зачем, сколько хранит и как отозвать согласие.`],
    ['personal-data-consent', `Согласие на обработку персональных данных | ${siteBrand}`, `Текст согласия на обработку персональных данных при отправке заявки на сайте ${siteBrand}.`],
    ['cookies', `Cookie и аналитика | ${siteBrand}`, `Какие записи сайт ${siteBrand} хранит в браузере и какие сторонние сервисы загружает.`],
    ['terms', `Пользовательское соглашение | ${siteBrand}`, `Условия использования сайта ${siteBrand}: статус сведений об объектах, права и ответственность.`],
  ];
  for (const [rel, title, description] of STATIC_PAGES) {
    writeHtml(rel, baseHtml, { title, description, canonical: `${siteUrl}/${rel}` });
  }
  // Служебные и личные страницы: в индекс не нужны
  for (const rel of ['favorites', 'login']) {
    writeHtml(rel, baseHtml, {
      title: rel === 'login' ? `Вход для сотрудников | ${siteBrand}` : `Избранное | ${siteBrand}`,
      description: `Служебная страница сайта ${siteBrand}.`,
      canonical: `${siteUrl}/${rel}`,
      robots: 'noindex, nofollow',
    });
  }

  // Оболочки для nginx: spa.html — известные динамические маршруты (/apartment/:id и т.п.):
  // без canonical и без noindex (мета ставит приложение; noindex в исходном HTML Google
  // может счесть окончательным). 404.html — неизвестные адреса, отдаются с кодом 404.
  const shell = patchHtmlHead(baseHtml, {
    title: siteBrand,
    description: homeDesc,
    canonical: `${siteUrl}/`,
  })
    .replace(/\s*<link\s+rel="canonical"[^>]*>/i, '')
    .replace(/\s*<meta\s+name="robots"[^>]*>/i, '')
    .replace(/\s*<meta\s+property="og:url"[^>]*>/i, '');
  writeAtomic(path.join(distDir, 'spa.html'), shell);
  fs.writeFileSync(
    path.join(distDir, '404.html'),
    shell
      .replace(/<title>[^<]*<\/title>/i, `<title>Страница не найдена | ${escapeAttr(siteBrand)}</title>`)
      .replace(/<meta\s+charset[^>]+>/i, (m) => `${m}\n    <meta name="robots" content="noindex, follow">`),
    'utf8',
  );

  let complexes = [];
  try {
    complexes = await loadBlockSlugs(apiBase, maxComplex);
    console.log(`[prerender-seo] API: ${complexes.length} ЖК (лимит ${maxComplex}).`);
  } catch (e) {
    console.warn(`[prerender-seo] Не удалось загрузить список ЖК (${e.message}). Только / и /catalog.`);
  }

  for (const c of complexes) {
    const desc = plainFromMaybeHtml(c.description, 200) || `ЖК ${c.name}: квартиры, планировки, инфраструктура.`;
    const coverTag = c.cover ? preloadImageTag(c.cover, '(min-width: 1024px) 66vw, 100vw', siteHost) : '';
    writeRaw(
      `complex/${c.slug}`,
      await withShell(
        ssr,
        patchHtmlHead(injectHead(baseHtml, coverTag), {
          title: `${c.name} — ЖК | ${siteBrand}`,
          description: desc,
          canonical: `${siteUrl}/complex/${encodeURIComponent(c.slug)}`,
        }),
        `/complex/${encodeURIComponent(c.slug)}`,
        preloadHref(coverTag),
      ),
    );
  }

  let newsSlugs = [];
  try {
    const j = await fetchJson(`${apiBase}/news?page=1&per_page=100`);
    const rows = Array.isArray(j) ? j : j.data || [];
    for (const n of rows) {
      if (!n?.slug || String(n.slug).includes('/') || String(n.slug).includes('..')) continue;
      newsSlugs.push(n.slug);
      writeHtml(`news/${n.slug}`, baseHtml, {
        title: `${n.title || n.slug} | ${siteBrand}`,
        description: plainFromMaybeHtml(n.excerpt || n.summary || n.body || n.content || '', 200) || `Новость ${siteBrand}.`,
        canonical: `${siteUrl}/news/${encodeURIComponent(n.slug)}`,
      });
    }
    console.log(`[prerender-seo] API: ${newsSlugs.length} новостей.`);
  } catch (e) {
    console.warn(`[prerender-seo] Новости не загружены (${e.message}).`);
  }

  // Визитки экспертов: превью ссылки в Telegram/MAX должно работать без JS
  const experts = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../src/shared/experts/expert-seo.json'), 'utf8'),
  );
  for (const e of experts) {
    writeHtml(`experts/${e.slug}`, baseHtml, {
      title: `${e.title} | ${siteBrand}`,
      description: e.description,
      canonical: `${siteUrl}/experts/${e.slug}`,
    });
  }

  const sitemap = buildSitemapXml(
    siteUrl,
    complexes.map((c) => c.slug),
    [
      '/personal-data-consent',
      ...experts.map((e) => `/experts/${e.slug}`),
      ...newsSlugs.map((slug) => `/news/${encodeURIComponent(slug)}`),
    ],
  );
  writeAtomic(path.join(distDir, 'sitemap.xml'), sitemap);

  const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /login
Disallow: /favorites
Disallow: /presentation/

Sitemap: ${sitemapIndexUrl}
Sitemap: ${siteUrl}/sitemap.xml
`;
  writeAtomic(path.join(distDir, 'robots.txt'), robots);

  console.log('[prerender-seo] Готово: index.html, catalog/, complex/*/, experts/*/, sitemap.xml, robots.txt');
}

main().catch((e) => {
  console.error('[prerender-seo]', e);
  process.exit(1);
});
