import { describe, expect, it } from 'vitest';
import { apartmentSeo, complexJsonLd, complexSeoText, homeJsonLd, roomsFromName } from './structured-seo';

const base = { siteUrl: 'https://yugaktsent.neeklo.ru/', brand: 'ЮгАкцент' };
const sp = (s: string) => s.replace(/ /g, ' ');

describe('structured-seo', () => {
  it('roomsFromName', () => {
    expect(roomsFromName('Студия')).toBe(0);
    expect(roomsFromName('2-комнатная')).toBe(2);
    expect(roomsFromName(null)).toBeNull();
  });

  it('apartment title, description and JSON-LD', () => {
    const r = apartmentSeo({
      ...base,
      id: 6525,
      rooms: 1,
      area: 38.95,
      floor: 5,
      price: 10_906_000,
      complexName: 'На высоком берегу',
      complexSlug: 'на-высоком-берегу',
      city: 'Анапа',
      image: 'https://bx.sskuban.ru/p.png',
    });
    expect(sp(r.title)).toBe('1-комн. квартира 39 м² в ЖК «На высоком берегу», Анапа — 10 906 000 ₽');
    expect(sp(r.description)).toContain('на 5 этаже в ЖК «На высоком берегу» (Анапа)');
    expect(sp(r.description)).toContain('280 000 ₽/м²');
    expect(r.canonical).toBe('https://yugaktsent.neeklo.ru/apartment/6525');
    const graph = r.jsonLd['@graph'] as Record<string, unknown>[];
    expect(graph.map((g) => g['@type'])).toEqual(['Apartment', 'Offer', 'BreadcrumbList']);
    expect(graph[1].price).toBe(10_906_000);
    const crumbs = (graph[2].itemListElement as { item: string }[]).map((i) => i.item);
    expect(crumbs[1]).toBe('https://yugaktsent.neeklo.ru/complex/%D0%BD%D0%B0-%D0%B2%D1%8B%D1%81%D0%BE%D0%BA%D0%BE%D0%BC-%D0%B1%D0%B5%D1%80%D0%B5%D0%B3%D1%83');
  });

  it('studio without price', () => {
    const r = apartmentSeo({ ...base, id: 1, rooms: 0, area: 28.28, price: null, complexName: 'Борский', city: 'Краснодар' });
    expect(sp(r.title)).toBe('Студия 28,3 м² в ЖК «Борский», Краснодар');
    expect(r.description).toContain('Цена по запросу');
    expect((r.jsonLd['@graph'] as unknown[]).length).toBe(2);
  });

  it('complex text and JSON-LD', () => {
    const t = complexSeoText({ name: 'Борский', city: 'Краснодар', priceFrom: 6_280_000, offerCount: 52, brand: 'ЮгАкцент' });
    expect(t.title).toBe('ЖК «Борский» в Краснодаре — цены и планировки');
    expect(sp(t.description)).toContain('52 квартир в продаже от 6,28 млн ₽');
    const j = complexJsonLd({ ...base, slug: 'борский', name: 'Борский', city: 'Краснодар', priceFrom: 6_280_000, priceTo: 9_000_000, offerCount: 52, lat: 0, lng: 0 });
    const graph = j['@graph'] as Record<string, unknown>[];
    expect(graph[0].geo).toBeUndefined();
    expect(graph[1]).toMatchObject({ '@type': 'AggregateOffer', lowPrice: 6_280_000, highPrice: 9_000_000, offerCount: 52 });
  });

  it('home JSON-LD', () => {
    const j = homeJsonLd({ ...base, phone: '8 (800) 234-57-15', city: 'Анапа', areaServed: ['Анапа'] });
    const graph = j['@graph'] as Record<string, unknown>[];
    expect(graph[0]['@type']).toBe('RealEstateAgent');
    expect(graph[0].telephone).toBe('8 (800) 234-57-15');
    expect((graph[1].potentialAction as { target: string }).target).toContain('/catalog?search=');
  });
});
