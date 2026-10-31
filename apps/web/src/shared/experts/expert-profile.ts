/**
 * Контракт эксперта: один и тот же для карточки на «О компании», персональной
 * страницы /experts/:slug и редактора в админке. Когда появится backend, сюда
 * придёт ответ API; сейчас источник — подтверждённые данные заказчика ниже
 * (ТЗ redesign v3, раздел 5) плюс демо-правки из админки в staging.
 */

export type ExpertLinkType = 'max' | 'telegram' | 'telegram_channel' | 'youtube' | 'vk' | 'dzen' | 'rutube' | 'website';

export interface ExpertLink {
  id: string;
  type: ExpertLinkType;
  /** Подпись в интерфейсе: «YouTube», «Telegram-канал» */
  title: string;
  /** Короткая подпись под названием: @ug.akcent */
  handle?: string;
  url: string;
  visible: boolean;
}

export interface ExpertVideo {
  id: string;
  title: string;
  url: string;
  /** Превью; без него показываем нейтральную плашку, а не чужую картинку */
  previewUrl?: string;
  priority: number;
  visible: boolean;
}

export interface ExpertGuide {
  id: string;
  title: string;
  description?: string;
  /** PDF; без файла гайд в публичной версии не показывается */
  fileUrl?: string;
  published: boolean;
}

export interface ExpertPhone {
  id: string;
  label: string;
  value: string;
  note?: string;
}

export type ExpertCtaTarget = 'max' | 'telegram_channel' | 'lead_form';

export interface ExpertProfile {
  slug: string;
  fullName: string;
  /** «Эксперт по новостройкам Юга России · кредитный брокер» */
  role: string;
  /** «Опыт более 8 лет» — только формулировка заказчика */
  experience?: string;
  city?: string;
  /** Портрет от заказчика; пока нет — нейтральная плашка с инициалами.
   *  Для файлов вида /experts/<slug>-960.jpg рядом лежат -480.jpg и .webp — см. expertPhotoSources */
  photoUrl?: string;
  coverUrl?: string;
  /** Экспертная позиция одной фразой — блок «О компании» на главной */
  summary?: string;
  /** Короткое приветствие для первого экрана */
  intro: string;
  /** Абзацы «О себе» — текст заказчика, разбитый на смысловые куски */
  about: string[];
  /** Рубрики и проекты */
  projects: { id: string; title: string; description: string }[];
  links: ExpertLink[];
  videos: ExpertVideo[];
  guides: ExpertGuide[];
  phones: ExpertPhone[];
  address?: string;
  primaryCta: ExpertCtaTarget;
  showOnTeamPage: boolean;
  seo: { title: string; description: string };
  published: boolean;
}

export const VLADISLAV_SLUG = 'vladislav-goncharov';

/** Данные подтверждены заказчиком (ТЗ v3, разделы 5.3–5.4). Ничего не додумывать. */
export const EXPERT_SEED: ExpertProfile[] = [
  {
    slug: VLADISLAV_SLUG,
    fullName: 'Владислав Гончаров',
    role: 'Эксперт по новостройкам Юга России · кредитный брокер',
    experience: 'Опыт более 8 лет',
    city: 'Анапа',
    // Портрет от заказчика (файл VLAD.jpeg), уменьшенные копии лежат в public/experts
    photoUrl: '/experts/vladislav-goncharov-960.jpg',
    summary:
      'Эксперт по новостройкам Анапы и Юга России, кредитный брокер и финансовый консультант по инвестициям в недвижимость. Опыт — более восьми лет.',
    intro: 'Друзья, приветствую! Я Владислав Гончаров — эксперт по новостройкам Анапы и всего Юга.',
    about: [
      'Кредитный брокер и финансовый консультант по инвестициям в недвижимость. Опыт работы — более 8 лет.',
      'Сейчас работаю над рубрикой «Проверено с Домклик» и снимаю полезные видеообзоры Анапы.',
      'В своих каналах публикую новости рынка недвижимости, делюсь кейсами и горячими предложениями. Записывайтесь на личную консультацию.',
    ],
    projects: [
      {
        id: 'domclick-rubric',
        title: 'Рубрика «Проверено с Домклик»',
        description: 'Видеообзоры новостроек Анапы — рубрика Владислава.',
      },
    ],
    links: [
      { id: 'max', type: 'max', title: 'MAX', handle: 'Личные сообщения', url: 'https://max.ru/u/f9LHodD0cOL5A61v_GflEAoYdBq8VlYV5jqA0Rb4e4URuI0MSGkB5xcryEo', visible: true },
      { id: 'tg-channel', type: 'telegram_channel', title: 'Telegram-канал', handle: '@ug_akcent', url: 'https://t.me/ug_akcent', visible: true },
      { id: 'youtube', type: 'youtube', title: 'YouTube', handle: '@ug.akcent', url: 'https://youtube.com/@ug.akcent?si=ORTJwOLs0oHjM5U1', visible: true },
      { id: 'vk', type: 'vk', title: 'ВКонтакте', handle: 'ug_novostroyki', url: 'https://vk.ru/ug_novostroyki', visible: true },
    ],
    videos: [],
    guides: [],
    phones: [
      { id: 'federal', label: 'По России', value: '8-800-234-57-15', note: 'Звонок бесплатный' },
      { id: 'anapa', label: 'Анапа', value: '+7 (918) 477-99-85' },
    ],
    address: 'Анапа, ул. Терская, 88',
    primaryCta: 'max',
    showOnTeamPage: true,
    seo: {
      title: 'Владислав Гончаров — эксперт по новостройкам Анапы и Юга',
      description:
        'Владислав Гончаров: эксперт по новостройкам Анапы и всего Юга, кредитный брокер. Опыт более 8 лет. Видеообзоры, каналы и личная консультация.',
    },
    published: true,
  },
];

/* ─── Демо-слой: правки из админки без backend ─── */

/** Правки живут только в браузере редактора и только в демо-режиме */
export const EXPERT_DRAFTS_STORAGE_KEY = 'yug_expert_drafts';
export const EXPERT_DRAFTS_EVENT = 'yug:expert-drafts';

/**
 * Демо-редактирование: dev, staging и боевая сборка с VITE_ADMIN_DEMO_EDITING=1 —
 * чтобы показать заказчику админку до появления API. В API ничего не пишется.
 */
export function isExpertDemoEditingEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_STAGING_READONLY === '1' ||
    import.meta.env.VITE_ADMIN_DEMO_EDITING === '1'
  );
}

function readDrafts(): Record<string, ExpertProfile> {
  if (!isExpertDemoEditingEnabled()) return {};
  try {
    const raw = localStorage.getItem(EXPERT_DRAFTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ExpertProfile>) : {};
  } catch {
    return {};
  }
}

export function saveExpertDraft(profile: ExpertProfile): void {
  const drafts = readDrafts();
  drafts[profile.slug] = profile;
  localStorage.setItem(EXPERT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  window.dispatchEvent(new Event(EXPERT_DRAFTS_EVENT));
}

export function resetExpertDraft(slug: string): void {
  const drafts = readDrafts();
  delete drafts[slug];
  localStorage.setItem(EXPERT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  window.dispatchEvent(new Event(EXPERT_DRAFTS_EVENT));
}

export function hasExpertDraft(slug: string): boolean {
  return slug in readDrafts();
}

export function listExperts(): ExpertProfile[] {
  const drafts = readDrafts();
  return EXPERT_SEED.map((e) => drafts[e.slug] ?? e);
}

export function getExpert(slug: string): ExpertProfile | null {
  return listExperts().find((e) => e.slug === slug) ?? null;
}

/* ─── Публичное представление ─── */

const SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru';

/** Абсолютный канонический адрес — для QR и «Скопировать ссылку». Никогда не localhost. */
export function expertCanonicalUrl(slug: string): string {
  return `${SITE_URL}/experts/${slug}`;
}

export function expertPath(slug: string): string {
  return `/experts/${slug}`;
}

/** Только то, что можно показывать: видимое, с адресом, с файлом */
export function publicExpertView(p: ExpertProfile) {
  const isHttp = (u?: string) => !!u && /^https?:\/\//i.test(u.trim());
  return {
    links: p.links.filter((l) => l.visible && isHttp(l.url)),
    videos: p.videos.filter((v) => v.visible && isHttp(v.url)).sort((a, b) => a.priority - b.priority),
    guides: p.guides.filter((g) => g.published && isHttp(g.fileUrl)),
    phones: p.phones.filter((ph) => ph.value.replace(/\D/g, '').length >= 10),
  };
}

export function expertInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** tel:-ссылка: 8-800 оставляем как есть, мобильные приводим к +7 */
export function phoneHref(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('8800')) return `tel:${digits}`;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `tel:+7${digits.slice(1)}`;
  return `tel:${digits}`;
}

/**
 * Уменьшенные копии портрета для srcset. Работает для файлов из public/experts
 * (<имя>-960.jpg + -480.jpg и .webp рядом); для загруженных из админки — только исходный адрес.
 */
export function expertPhotoSources(url?: string): { webp?: string; jpg?: string } {
  const m = url?.match(/^(\/experts\/[\w-]+)-960\.jpg$/);
  if (!m) return {};
  return {
    webp: `${m[1]}-480.webp 480w, ${m[1]}-960.webp 960w`,
    jpg: `${m[1]}-480.jpg 480w, ${m[1]}-960.jpg 960w`,
  };
}

/** Абсолютный адрес картинки — для og:image и JSON-LD */
export function absoluteSiteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
