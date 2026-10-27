/**
 * Замеры пользовательских сценариев, которых не видит Lighthouse:
 * - время до заголовка первого экрана при первом и повторном визите;
 * - переход «каталог → ЖК»: был ли спиннер на весь экран, сколько ждали заголовок.
 * Запуск: node apps/e2e/scripts/perf-journeys.mjs [base-url]   (по умолчанию локальная сборка :4173)
 */
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const browser = await chromium.launch(process.env.PW_BUNDLED ? {} : { channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
// «Быстрый 4G» и 4× медленнее процессор — как у Lighthouse mobile
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

async function heroTime(label) {
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'commit' });
  await page.locator('section[aria-roledescription="carousel"] h1').first().waitFor({ timeout: 60000 });
  return { scenario: label, ms: Date.now() - t0 };
}

const rows = [];
rows.push(await heroTime('Главная: заголовок первого экрана, первый визит'));
rows.push(await heroTime('Главная: заголовок первого экрана, повторный визит'));

await page.goto(base + '/catalog', { waitUntil: 'load' });
const card = page.locator('a[href^="/complex/"]').first();
await card.waitFor({ timeout: 60000 });
await card.hover().catch(() => {});
await page.waitForTimeout(1500);
let spinner = false;
page.on('console', () => {});
const watch = page.evaluate(() => new Promise((resolve) => {
  const mo = new MutationObserver(() => {
    if (document.querySelector('[role="progressbar"][aria-label="Загрузка"], .animate-spin.h-6')) { resolve(true); mo.disconnect(); }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { resolve(false); mo.disconnect(); }, 8000);
}));
const t0 = Date.now();
await card.click();
await page.locator('h1').filter({ hasNotText: 'Жилые комплексы' }).first().waitFor({ timeout: 60000 });
const navMs = Date.now() - t0;
spinner = await watch;
rows.push({ scenario: 'Каталог → ЖК: до заголовка ЖК', ms: navMs, fullscreenLoader: spinner });

console.table(rows);
await browser.close();
