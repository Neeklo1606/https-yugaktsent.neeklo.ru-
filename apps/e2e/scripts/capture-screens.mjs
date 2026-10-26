/**
 * Скриншоты контрольных экранов для before/after редизайна.
 * Запуск: node apps/e2e/scripts/capture-screens.mjs <папка> [base-url]
 * По умолчанию снимает локальный dev (staging, только чтение) на 390 и 1440.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] ?? 'screens';
const base = (process.argv[3] ?? 'http://localhost:5173').replace(/\/$/, '');
const pages = (process.env.SCREENS ?? '/,/catalog,/complex/eden-family-hotel,/apartment/13113,/experts/vladislav-goncharov')
  .split(',')
  .filter(Boolean);
const widths = (process.env.WIDTHS ?? '390,1440').split(',').map(Number);

mkdirSync(outDir, { recursive: true });
// Свежий Playwright может не найти свой headless-shell; системный Chrome подходит для скриншотов
const browser = await chromium.launch(process.env.PW_BUNDLED ? {} : { channel: 'chrome' });
const report = [];
for (const width of widths) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    deviceScaleFactor: width < 768 ? 2 : 1,
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  const page = await ctx.newPage();
  for (const p of pages) {
    const started = Date.now();
    const res = await page.goto(base + p, { waitUntil: 'load', timeout: 45000 }).catch((e) => ({ status: () => String(e.message).slice(0, 60) }));
    await page.waitForTimeout(2500);
    // Проматываем страницу, чтобы ленивые картинки загрузились до полноразмерного снимка
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(window.innerHeight * 0.8)) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const name = `${width}${p === '/' ? '-home' : p.replace(/[/?=&]+/g, '-')}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
    report.push({ width, page: p, status: res?.status?.(), ms: Date.now() - started, hOverflowPx: overflow });
  }
  await ctx.close();
}
await browser.close();
console.table(report);
