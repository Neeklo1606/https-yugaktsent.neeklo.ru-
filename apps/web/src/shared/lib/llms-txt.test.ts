import { describe, expect, it } from 'vitest';
// @ts-ignore — .mjs без типов
import { buildLlmsTxt } from '../../../scripts/prerender-seo.mjs';

describe('buildLlmsTxt', () => {
  const txt: string = buildLlmsTxt({
    siteUrl: 'https://example.ru',
    siteBrand: 'ЮгАкцент',
    settings: { phone_main: '8 (800) 000-00-00', email: 'info@example.ru', inn: '' },
    complexes: [
      { slug: 'сердце', name: 'Сердце', city: 'Анапа', address: 'ул. Ленина, 1', priceFrom: 5_000_000, priceTo: 9_000_000, count: 120 },
      { slug: 'без-цены', name: 'Без цены', city: 'Сочи', priceFrom: null, priceTo: null, count: 0 },
    ],
    experts: [{ slug: 'ivan', title: 'Иван Иванов' }],
  });

  it('заголовок, выжимка и контакты', () => {
    expect(txt.startsWith('# ЮгАкцент\n\n> Агентство недвижимости')).toBe(true);
    expect(txt).toContain('Анапа, Сочи');
    expect(txt).toContain('- Телефон: 8 (800) 000-00-00');
    expect(txt).not.toContain('ИНН');
  });

  it('ЖК со ссылкой, ценой и числом квартир; без цены — без «от»', () => {
    expect(txt).toContain('(https://example.ru/complex/%D1%81%D0%B5%D1%80%D0%B4%D1%86%D0%B5)');
    expect(txt).toMatch(/Сердце.*от 5\s000\s000 ₽ до 9\s000\s000 ₽ · квартир: 120/);
    expect(txt).toMatch(/«Без цены»\]\([^)]+\): Сочи\n/);
    expect(txt).toContain('квартир в продаже: 120');
  });

  it('эксперты и правовой блок', () => {
    expect(txt).toContain('- [Иван Иванов](https://example.ru/experts/ivan)');
    expect(txt).toContain('/privacy');
  });
});
