/**
 * Быстрый smoke маршрутов: статус, ошибки в консоли, горизонтальный скролл.
 * Запуск: node apps/e2e/scripts/smoke-routes.mjs [base-url]
 */
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const routes = ['/', '/catalog', '/complex/eden-family-hotel', '/apartment/13113', '/map', '/about', '/contacts', '/news', '/favorites', '/experts/vladislav-goncharov', '/experts/net-takogo'];
const widths = [320, 390, 1440];
// Шум окружения, а не дефекты страницы: битые сертификаты у фото Profitbase, отклонённые сторонние ресурсы
const NOISE = /ERR_CERT|net::ERR_|Failed to load resource|favicon|yandex|mc\.yandex/i;

const browser = await chromium.launch(process.env.PW_BUNDLED ? {} : { channel: 'chrome' });
const rows = [];
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: width < 768, hasTouch: width < 768 });
  for (const r of routes) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && !NOISE.test(m.text()) && errors.push(m.text().slice(0, 120)));
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 120)}`));
    const res = await page.goto(base + r, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h1: document.querySelector('h1')?.textContent?.trim().slice(0, 40) ?? '',
      title: document.title.slice(0, 50),
    }));
    rows.push({ width, route: r, status: res?.status() ?? 'fail', overflowPx: info.overflow, h1: info.h1, errors: errors.length ? errors.join(' | ') : '' });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.table(rows);
