/**
 * Метки рекламной кампании первого захода (utm_*). Персональных данных не содержат.
 * Хранятся в sessionStorage до конца вкладки и уходят вместе с заявкой.
 */
const KEY = 'yug_utm_v1';
const FIELDS = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_content', 'utmContent'],
  ['utm_term', 'utmTerm'],
] as const;

export type UtmPayload = Partial<Record<(typeof FIELDS)[number][1], string>>;

export function captureUtmFromLocation(search: string = typeof window !== 'undefined' ? window.location.search : ''): void {
  try {
    const params = new URLSearchParams(search);
    const found: UtmPayload = {};
    for (const [q, k] of FIELDS) {
      const v = params.get(q);
      if (v) found[k] = v.slice(0, 200);
    }
    if (Object.keys(found).length && !sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, JSON.stringify(found));
    }
  } catch {
    /* приватный режим — без меток */
  }
}

export function readUtm(): UtmPayload {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: UtmPayload = {};
    for (const [, k] of FIELDS) {
      if (typeof parsed[k] === 'string') out[k] = (parsed[k] as string).slice(0, 200);
    }
    return out;
  } catch {
    return {};
  }
}

/** Адрес страницы без query и hash: в URL могут оказаться чужие параметры, ПД туда не пишем */
export function cleanSourceUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}
