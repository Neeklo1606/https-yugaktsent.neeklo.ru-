/**
 * Заголовки, описания и JSON-LD для страниц квартир, ЖК и главной.
 * Один код и для приложения (useEntitySeoMeta), и для пререндера HTML (scripts/prerender-seo.mjs
 * берёт функции из dist-ssr/prerender-entry.mjs) — тексты в HTML для роботов и после загрузки JS совпадают.
 */

const NBSP = ' ';

export type ApartmentSeoInput = {
  id: number | string;
  /** 0 — студия; null — неизвестно */
  rooms: number | null;
  area: number | null;
  floor?: number | null;
  floorsTotal?: number | null;
  price: number | null;
  complexName?: string | null;
  complexSlug?: string | null;
  /** Корпус/литер: «Литер 9.1» */
  building?: string | null;
  city?: string | null;
  image?: string | null;
  siteUrl: string;
  brand: string;
};

export type SeoResult = {
  /** Без бренда — бренд добавляет useEntitySeoMeta / пререндер через « | » */
  title: string;
  description: string;
  canonical: string;
  jsonLd: Record<string, unknown>;
};

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** «Студия» → 0, «2-комнатная» → 2, иначе null */
export function roomsFromName(name: string | null | undefined): number | null {
  const s = String(name || '').toLowerCase();
  if (!s) return null;
  if (s.includes('студ')) return 0;
  const m = /(\d+)/.exec(s);
  return m ? Number(m[1]) : null;
}

function groupDigits(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function areaText(area: number): string {
  const r = Math.round(area * 100) / 100;
  return `${String(r).replace('.', ',')}${NBSP}м²`;
}

function roomsShort(rooms: number | null): string {
  if (rooms == null) return 'Квартира';
  return rooms === 0 ? 'Студия' : `${rooms}-комн. квартира`;
}

function roomsLong(rooms: number | null): string {
  if (rooms == null) return 'квартира';
  return rooms === 0 ? 'квартира-студия' : `${rooms}-комнатная квартира`;
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

export function breadcrumbs(siteUrl: string, items: { name: string; path: string }[]): Record<string, unknown> {
  const base = trimSlash(siteUrl);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Главная', path: '/' }, ...items].map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${base}${it.path === '/' ? '/' : it.path}`,
    })),
  };
}

export function apartmentSeo(a: ApartmentSeoInput): SeoResult {
  const base = trimSlash(a.siteUrl);
  const path = `/apartment/${a.id}`;
  const canonical = `${base}${path}`;
  const area = num(a.area);
  const price = num(a.price);
  const floor = num(a.floor);
  const floorsTotalRaw = num(a.floorsTotal);
  // Заглушка «1» из маппера при отсутствии данных: этажность меньше этажа квартиры не показываем
  const floorsTotal = floorsTotalRaw && floor && floorsTotalRaw >= floor ? floorsTotalRaw : null;
  const complex = a.complexName?.trim() || null;
  const city = a.city?.trim() || null;
  const building = a.building?.trim() || null;

  const where = [complex ? `в ЖК «${complex}»` : null, city].filter(Boolean).join(', ');
  const title = [
    `${roomsShort(a.rooms)}${area ? ` ${areaText(area)}` : ''}${num(a.floor) ? `, ${num(a.floor)} этаж` : ''}${building ? `, ${building}` : ''}${where ? ` ${where}` : ''}`,
    price ? `${groupDigits(price)}${NBSP}₽` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  const floorText = floor ? ` на ${floor}${floorsTotal ? ` из ${floorsTotal}` : ''} этаже` : '';
  const placeText = complex ? ` в ЖК «${complex}»${city ? ` (${city})` : ''}` : city ? ` в городе ${city}` : '';
  const priceText = price
    ? ` Цена ${groupDigits(price)}${NBSP}₽${area ? `, ${groupDigits(price / area)}${NBSP}₽/м²` : ''}.`
    : ' Цена по запросу.';
  const description = (
    `Продаётся ${roomsLong(a.rooms)}${area ? ` ${areaText(area)}` : ''}${floorText}${placeText}.` +
    `${priceText} Планировка, цены застройщика, бесплатная консультация ${a.brand}.`
  ).slice(0, 300);

  const crumbs = [
    ...(complex && a.complexSlug ? [{ name: `ЖК ${complex}`, path: `/complex/${encodeURIComponent(a.complexSlug)}` }] : []),
    { name: title.split(' — ')[0], path },
  ];

  const offer: Record<string, unknown> | null = price
    ? {
        '@type': 'Offer',
        price: Math.round(price),
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: canonical,
        seller: { '@type': 'RealEstateAgent', name: a.brand, url: `${base}/` },
      }
    : null;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Apartment',
        '@id': `${canonical}#apartment`,
        name: title,
        description,
        url: canonical,
        ...(a.image ? { image: a.image } : {}),
        ...(a.rooms != null ? { numberOfRooms: a.rooms === 0 ? 1 : a.rooms } : {}),
        ...(area ? { floorSize: { '@type': 'QuantitativeValue', value: area, unitCode: 'MTK' } } : {}),
        ...(floor ? { floorLevel: String(floor) } : {}),
        ...(city ? { address: { '@type': 'PostalAddress', addressLocality: city, addressCountry: 'RU' } } : {}),
        ...(complex && a.complexSlug
          ? { containedInPlace: { '@type': 'Residence', name: `ЖК ${complex}`, url: `${base}/complex/${encodeURIComponent(a.complexSlug)}` } }
          : {}),
      },
      ...(offer ? [{ ...offer, itemOffered: { '@id': `${canonical}#apartment` } }] : []),
      breadcrumbs(base, crumbs),
    ],
  };

  return { title, description, canonical, jsonLd };
}

export type ComplexSeoInput = {
  slug: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  image?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  offerCount?: number | null;
  lat?: number | null;
  lng?: number | null;
  siteUrl: string;
  brand: string;
};

export function complexJsonLd(c: ComplexSeoInput): Record<string, unknown> {
  const base = trimSlash(c.siteUrl);
  const url = `${base}/complex/${encodeURIComponent(c.slug)}`;
  const from = num(c.priceFrom);
  const to = num(c.priceTo);
  const count = num(c.offerCount);
  const lat = typeof c.lat === 'number' && Number.isFinite(c.lat) && c.lat !== 0 ? c.lat : null;
  const lng = typeof c.lng === 'number' && Number.isFinite(c.lng) && c.lng !== 0 ? c.lng : null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Residence',
        '@id': `${url}#complex`,
        name: `ЖК ${c.name}`,
        url,
        ...(c.description ? { description: c.description } : {}),
        ...(c.image ? { image: c.image } : {}),
        ...(c.address || c.city
          ? {
              address: {
                '@type': 'PostalAddress',
                ...(c.address ? { streetAddress: c.address } : {}),
                ...(c.city ? { addressLocality: c.city } : {}),
                addressCountry: 'RU',
              },
            }
          : {}),
        ...(lat != null && lng != null ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
      },
      ...(from
        ? [
            {
              '@type': 'AggregateOffer',
              priceCurrency: 'RUB',
              lowPrice: Math.round(from),
              ...(to && to >= from ? { highPrice: Math.round(to) } : {}),
              ...(count ? { offerCount: Math.round(count) } : {}),
              url,
              itemOffered: { '@id': `${url}#complex` },
              seller: { '@type': 'RealEstateAgent', name: c.brand, url: `${base}/` },
            },
          ]
        : []),
      breadcrumbs(base, [
        { name: 'Каталог', path: '/catalog' },
        { name: `ЖК ${c.name}`, path: `/complex/${encodeURIComponent(c.slug)}` },
      ]),
    ],
  };
}

export type OrgSeoInput = {
  siteUrl: string;
  brand: string;
  legalName?: string;
  logo?: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  areaServed?: string[];
};

/** Главная: агентство + сайт с поиском */
export function homeJsonLd(o: OrgSeoInput): Record<string, unknown> {
  const base = trimSlash(o.siteUrl);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'RealEstateAgent',
        '@id': `${base}/#org`,
        name: o.brand,
        ...(o.legalName ? { alternateName: o.legalName } : {}),
        url: `${base}/`,
        logo: o.logo || `${base}/og-default.jpg`,
        image: o.logo || `${base}/og-default.jpg`,
        ...(o.phone ? { telephone: o.phone } : {}),
        ...(o.address || o.city
          ? {
              address: {
                '@type': 'PostalAddress',
                ...(o.address ? { streetAddress: o.address } : {}),
                ...(o.city ? { addressLocality: o.city } : {}),
                addressCountry: 'RU',
              },
            }
          : {}),
        ...(o.areaServed?.length ? { areaServed: o.areaServed.map((name) => ({ '@type': 'City', name })) } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#site`,
        name: o.brand,
        url: `${base}/`,
        publisher: { '@id': `${base}/#org` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${base}/catalog?search={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

/** Для <script type="application/ld+json"> внутри HTML */
export function jsonLdScriptBody(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const CITY_PREPOSITIONAL: Record<string, string> = {
  Анапа: 'Анапе',
  Новороссийск: 'Новороссийске',
  Краснодар: 'Краснодаре',
  Майкоп: 'Майкопе',
};

export function cityIn(city: string | null | undefined): string | null {
  const c = city?.trim();
  if (!c) return null;
  return `в ${CITY_PREPOSITIONAL[c] ?? c}`;
}

function flatsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'квартира';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'квартиры';
  return 'квартир';
}

function millions(n: number): string {
  if (n < 1_000_000) return `${groupDigits(n)}${NBSP}₽`;
  const m = Math.round((n / 1_000_000) * 100) / 100;
  return `${String(m).replace('.', ',')}${NBSP}млн${NBSP}₽`;
}

function plain(s: string | null | undefined, max: number): string {
  const t = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Title (без бренда) и description страницы ЖК */
export function complexSeoText(c: {
  name: string;
  city?: string | null;
  priceFrom?: number | null;
  offerCount?: number | null;
  description?: string | null;
  brand: string;
}): { title: string; description: string } {
  const where = cityIn(c.city);
  const title = `ЖК «${c.name}»${where ? ` ${where}` : ''} — цены и планировки`;
  const from = num(c.priceFrom);
  const count = num(c.offerCount);
  const own = plain(c.description, 200);
  const description =
    own ||
    `ЖК «${c.name}»${where ? ` ${where}` : ''}: ${count ? `${groupDigits(count)} ${flatsWord(count)} в продаже` : 'квартиры в продаже'}` +
      `${from ? ` от ${millions(from)}` : ''}. Планировки, шахматка и цены застройщика, бесплатная консультация ${c.brand}.`;
  return { title, description };
}
