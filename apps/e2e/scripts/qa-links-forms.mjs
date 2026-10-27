/**
 * Финальный QA витрины: глубокие ссылки, внутренние ссылки/CTA, форма заявки.
 * Работает против staging (локальная сборка со staging-guard): заявка получает демо-ответ и в CRM не уходит.
 * Запуск: node apps/e2e/scripts/qa-links-forms.mjs [base-url]
 */
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const browser = await chromium.launch(process.env.PW_BUNDLED ? {} : { channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()}: ${String(e.message).slice(0, 120)}`));

const isNotFound = () => page.evaluate(() => /^404$/.test(document.querySelector('h1')?.textContent?.trim() ?? ''));

// 1. Глубокие ссылки: прямой заход и обновление страницы
const deep = ['/experts/vladislav-goncharov', '/complex/eden-family-hotel', '/apartment/13113', '/catalog?type=apartments&market=new&rooms=1', '/news', '/about', '/privacy', '/terms'];
const deepRows = [];
for (const p of deep) {
  const res = await page.goto(base + p, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  deepRows.push({ path: p, status: res?.status(), notFound: await isNotFound(), h1: (await page.locator('h1').first().textContent().catch(() => ''))?.slice(0, 40) });
}
console.log('ГЛУБОКИЕ ССЫЛКИ'); console.table(deepRows);

// 2. Внутренние ссылки со страниц-хабов
const hubs = ['/', '/catalog', '/complex/eden-family-hotel', '/experts/vladislav-goncharov', '/about'];
const links = new Set();
for (const h of hubs) {
  await page.goto(base + h, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  for (const href of await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')))) {
    if (href && !href.startsWith('/admin') && !href.startsWith('/presentation')) links.add(href.split('#')[0]);
  }
}
const broken = [];
for (const href of links) {
  await page.goto(base + href, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await isNotFound()) broken.push(href);
}
console.log(`ВНУТРЕННИЕ ССЫЛКИ: проверено ${links.size}, ведут на 404: ${broken.length}`, broken);

// 3. Внешние ссылки эксперта: только https, без пустых
await page.goto(base + '/experts/vladislav-goncharov', { waitUntil: 'load' });
await page.waitForTimeout(2000);
const ext = await page.$$eval('a[target="_blank"]', (as) => as.map((a) => a.getAttribute('href')));
console.log('ВНЕШНИЕ ССЫЛКИ ЭКСПЕРТА:', ext.length, 'не https:', ext.filter((h) => !/^https:\/\//.test(h ?? '')));

// 4. Форма заявки на главной (staging → демо-ответ 201)
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const form = page.locator('#lead-highlight-title').locator('xpath=ancestor::section[1]');
await form.scrollIntoViewIfNeeded();
await form.getByPlaceholder('Имя').fill('Тест QA');
const phone = form.locator('input[type="tel"], input[inputmode="tel"]').first();
await phone.click();
await phone.pressSequentially('9001234567');
const consent = form.locator('button[role="checkbox"], input[type="checkbox"]').first();
if (await consent.count()) await consent.click();
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/v1/requests') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
  form.getByRole('button', { name: /подборк|отправ/i }).first().click(),
]);
await page.waitForTimeout(1500);
const sentBody = resp ? await resp.json().catch(() => null) : null;
const successVisible = await form.getByText(/спасибо|отправлен|заявк[аи] принят/i).first().isVisible().catch(() => false);
console.log('ФОРМА:', { status: resp?.status(), demo: sentBody?.demo === true, successVisible });

console.log('ОШИБКИ JS НА СТРАНИЦАХ:', errors.length ? errors : 'нет');
await browser.close();
