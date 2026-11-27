import { describe, expect, it } from 'vitest';
// @ts-ignore — .mjs-скрипт пререндера без типов
import { apartmentShellHtml } from '../../../scripts/prerender-seo.mjs';

describe('apartmentShellHtml', () => {
  it('выносит название в H1, цену отдельно и ссылку на ЖК', () => {
    const html = apartmentShellHtml({
      title: '1-комн. 38 м², 5 этаж в ЖК «Сердце», Анапа — 5 200 000 ₽',
      description: 'Продаётся квартира',
      price: 5200000,
      complexName: 'Сердце',
      complexSlug: 'сердце',
    });
    expect(html).toContain('<div id="ssr-shell">');
    expect(html).toContain('<h1>1-комн. 38 м², 5 этаж в ЖК «Сердце», Анапа</h1>');
    expect(html).toContain('<p class="apt-price">5 200 000 ₽</p>');
    expect(html).toContain('href="/complex/%D1%81%D0%B5%D1%80%D0%B4%D1%86%D0%B5"');
  });

  it('экранирует текст и без ЖК ведёт в каталог', () => {
    const html = apartmentShellHtml({ title: 'Студия <b>', description: 'a & <script>', price: null });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('Цена по запросу');
    expect(html).toContain('href="/catalog"');
  });
});

describe('routeModulePreloads', () => {
  it('нет папки или чанка — пустая строка', async () => {
    // @ts-ignore
    const { routeModulePreloads } = await import('../../../scripts/prerender-seo.mjs');
    expect(routeModulePreloads('/nonexistent', 'RedesignApartment', '')).toBe('');
  });
});

// @ts-ignore — .mjs-скрипт пререндера без типов
import { staticShellHtml } from '../../../scripts/prerender-seo.mjs';

describe('staticShellHtml', () => {
  it('отдаёт h1, текст, факты и ссылки без JS и экранирует текст', () => {
    const html = staticShellHtml({
      h1: 'Контакты <офис>',
      lead: 'Офис в Анапе',
      facts: [['Телефон', '8 (800) 234-57-15']],
      links: [['/catalog', 'Новостройки']],
    });
    expect(html).toContain('<h1>Контакты &lt;офис&gt;</h1>');
    expect(html).toContain('8 (800) 234-57-15');
    expect(html).toContain('href="/catalog"');
    expect(html).toContain('id="ssr-shell"');
  });
});
