/**
 * Наполнение карточки ЖК, которого нет в фидах (blocks.content):
 * видеообзоры, генплан, дополнительные фото и свои частые вопросы.
 */
export type ComplexContent = {
  videos: string[];
  masterplanUrl: string | null;
  masterplan3dUrl: string | null;
  gallery: string[];
  faq: { q: string; a: string }[];
  tagline: string | null;
  highlights: string[];
  builderName: string | null;
};

export const HOUSING_TYPE_LABEL: Record<string, string> = {
  flat: 'Квартиры',
  aparthotel: 'Апартаменты',
  cottage: 'Коттеджи',
};

export function parseComplexContent(raw: unknown): ComplexContent {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const faq = Array.isArray(r.faq)
    ? r.faq
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
        .map((x) => ({ q: String(x.q ?? '').trim(), a: String(x.a ?? '').trim() }))
        .filter((x) => x.q && x.a)
    : [];
  return {
    videos: strs(r.videos),
    masterplanUrl: str(r.masterplanUrl),
    masterplan3dUrl: str(r.masterplan3dUrl),
    gallery: strs(r.gallery),
    faq,
    tagline: str(r.tagline),
    highlights: strs(r.highlights).map((x) => x.trim()),
    builderName: str(r.builderName),
  };
}

export type VideoEmbed = { provider: 'vk' | 'youtube' | 'rutube'; embedUrl: string; watchUrl: string };

/** Ссылка на ролик → адрес плеера. Неизвестные площадки — null (покажем просто ссылку). */
export function videoEmbed(url: string): VideoEmbed | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  // VK: vk.com/video-123_456, vkvideo.ru/video-123_456, ?z=video-123_456
  if (host === 'vk.com' || host === 'vk.ru' || host === 'vkvideo.ru') {
    if (u.pathname.startsWith('/video_ext.php')) return { provider: 'vk', embedUrl: u.toString(), watchUrl: u.toString() };
    const m = (u.pathname + (u.searchParams.get('z') ?? '')).match(/video(-?\d+)_(\d+)/);
    if (m) {
      return {
        provider: 'vk',
        embedUrl: `https://vkvideo.ru/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`,
        watchUrl: url,
      };
    }
    return null;
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
      id = m?.[1] ?? null;
    }
    if (id && /^[\w-]{6,}$/.test(id)) {
      return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, watchUrl: url };
    }
    return null;
  }
  if (host === 'rutube.ru') {
    const m = u.pathname.match(/\/(?:video|play\/embed)\/([0-9a-f]{20,})/i);
    if (m) return { provider: 'rutube', embedUrl: `https://rutube.ru/play/embed/${m[1]}`, watchUrl: url };
  }
  return null;
}

type FaqInput = {
  name: string;
  city: string | null;
  builder: string | null;
  deadline: string | null;
  address: string | null;
  priceFromText: string | null;
  availableCount: number;
  buildingsCount: number;
  finishings: string[];
  roomsText: string | null;
  housingType: string;
};

/**
 * Частые вопросы: сначала по данным самого ЖК (без выдумок — вопрос появляется,
 * только если ответ есть в данных), затем общие про покупку новостройки.
 */
export function buildComplexFaq(d: FaqInput, own: { q: string; a: string }[] = []): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [...own];
  const where = d.city ? ` в ${cityPrepositional(d.city)}` : '';
  const isApart = d.housingType === 'aparthotel';
  if (d.priceFromText) {
    out.push({
      q: `Сколько стоит ${isApart ? 'апартамент' : 'квартира'} в «${d.name}»?`,
      a: `Цены — ${d.priceFromText}. ${d.availableCount > 0 ? `Сейчас в продаже ${d.availableCount} ${plural(d.availableCount, 'вариант', 'варианта', 'вариантов')}${d.roomsText ? `: ${d.roomsText}` : ''}. ` : ''}Цены обновляются по данным застройщика несколько раз в день.`,
    });
  }
  if (d.deadline) out.push({ q: `Когда сдача ЖК «${d.name}»?`, a: `Срок сдачи по данным застройщика — ${d.deadline}. Точный график по литерам уточнит менеджер.` });
  if (d.builder) out.push({ q: `Кто застройщик «${d.name}»?`, a: `Застройщик — ${d.builder}. Подскажем, какие ещё объекты он строит${where}, и поможем сравнить.` });
  if (d.address) out.push({ q: `Где находится «${d.name}»?`, a: `Адрес: ${d.address}. Расположение и что рядом — на карте на этой странице.` });
  if (d.finishings.length) out.push({ q: 'С какой отделкой продаются квартиры?', a: `В продаже варианты: ${d.finishings.join(', ')}.` });
  if (d.buildingsCount > 1) out.push({ q: `Сколько домов в комплексе?`, a: `В продаже квартиры в ${d.buildingsCount} ${plural(d.buildingsCount, 'доме', 'домах', 'домах')} (литерах и секциях) — все они есть в шахматке выше.` });
  out.push(
    {
      q: 'Можно купить в ипотеку?',
      a: isApart
        ? 'Да, апартаменты покупают в ипотеку, но льготные программы (семейная, IT) на них обычно не распространяются. Рассчитать платёж можно в калькуляторе выше, а менеджер подберёт банк.'
        : 'Да. Доступны семейная, IT и базовая ипотека — платёж можно прикинуть в калькуляторе выше, а менеджер поможет подобрать банк и программу.',
    },
    {
      q: 'Какой минимальный первоначальный взнос?',
      a: 'Обычно от 20% по семейной и базовой ипотеке; у некоторых застройщиков бывают программы с меньшим взносом и рассрочка. Актуальные условия по этому ЖК подскажет менеджер.',
    },
    {
      q: 'Что такое эскроу-счёт и зачем он нужен?',
      a: 'Деньги за квартиру по договору долевого участия хранятся на эскроу-счёте в банке и переходят застройщику только после сдачи дома. Если дом не сдадут, банк вернёт деньги покупателю — это защищает вас от рисков стройки.',
    },
  );
  return out;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function cityPrepositional(city: string): string {
  const map: Record<string, string> = {
    Анапа: 'Анапе',
    Новороссийск: 'Новороссийске',
    Краснодар: 'Краснодаре',
    Майкоп: 'Майкопе',
  };
  return map[city] ?? city;
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((x) => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
}
