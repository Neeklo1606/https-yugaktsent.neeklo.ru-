/**
 * Наполнение карточки ЖК, которого нет в фидах застройщиков: видеообзоры, генплан,
 * дополнительные фото и частые вопросы. Хранится в blocks.content (JSONB).
 *
 * Пишет только редактор из админки, но всё равно чистим: берём лишь известные поля,
 * ссылки — только http(s) или наши /uploads, тексты обрезаем.
 */
export type BlockContent = {
  videos?: string[];
  masterplanUrl?: string;
  masterplan3dUrl?: string;
  gallery?: string[];
  faq?: { q: string; a: string }[];
};

const MAX_URLS = 30;
const MAX_FAQ = 30;

function cleanUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 2000) return null;
  if (s.startsWith('/uploads/')) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function sanitizeBlockContent(raw: unknown): BlockContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: BlockContent = {};
  const urls = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map(cleanUrl).filter((x): x is string => Boolean(x)))].slice(0, MAX_URLS) : [];

  const videos = urls(r.videos);
  if (videos.length) out.videos = videos;
  const gallery = urls(r.gallery);
  if (gallery.length) out.gallery = gallery;
  const mp = cleanUrl(r.masterplanUrl);
  if (mp) out.masterplanUrl = mp;
  const mp3d = cleanUrl(r.masterplan3dUrl);
  if (mp3d) out.masterplan3dUrl = mp3d;
  if (Array.isArray(r.faq)) {
    const faq = r.faq
      .map((x) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return { q: cleanText(o.q, 300), a: cleanText(o.a, 3000) };
      })
      .filter((x) => x.q && x.a)
      .slice(0, MAX_FAQ);
    if (faq.length) out.faq = faq;
  }
  return out;
}
