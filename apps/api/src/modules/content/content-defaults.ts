import { SiteSettingFieldType } from '@prisma/client';

/** Значения по умолчанию для главной (совпадают с packages/database/prisma/seed.ts). */
export const DEFAULT_HOMEPAGE_SITE_SETTINGS: Array<{
  key: string;
  value: string;
  groupName: string;
  label: string;
  fieldType: SiteSettingFieldType;
  sortOrder: number;
}> = [
  {
    key: 'home_hot_title',
    value: 'Горячие предложения',
    groupName: 'homepage',
    label: 'Заголовок блока «Горячие предложения»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 0,
  },
  {
    key: 'home_hot_per_page',
    value: '8',
    groupName: 'homepage',
    label: 'Сколько карточек в «Горячих предложениях»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 1,
  },
  {
    key: 'home_hot_mode',
    value: 'latest',
    groupName: 'homepage',
    label:
      'Режим горячих: latest — последние ЖК с офферами; promoted — только «Реклама»; fixed_slugs — список slug ниже',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 2,
  },
  {
    key: 'home_hot_fixed_slugs',
    value: '',
    groupName: 'homepage',
    label: 'Фиксированные slug ЖК (через запятую), если режим fixed_slugs',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 3,
  },
  {
    key: 'home_hot_badge',
    value: 'Горячее предложение',
    groupName: 'homepage',
    label: 'Текст бейджа на карточке «Горячие»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 4,
  },
  {
    key: 'home_start_title',
    value: 'Старт продаж',
    groupName: 'homepage',
    label: 'Заголовок блока «Старт продаж»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 10,
  },
  {
    key: 'home_start_per_page',
    value: '3',
    groupName: 'homepage',
    label: 'Сколько карточек в «Старте продаж»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 11,
  },
  {
    key: 'home_start_window_days',
    value: '365',
    groupName: 'homepage',
    label: 'Окно дней: дата старта продаж от сегодня до +N дней',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 12,
  },
  {
    key: 'home_start_badge',
    value: 'Старт продаж',
    groupName: 'homepage',
    label: 'Текст бейджа «Старт продаж»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 13,
  },
  {
    key: 'home_banners',
    value: '[]',
    groupName: 'homepage',
    label:
      'Слайды баннера на главной (JSON). Редактируется в админке → «Главная: баннеры», вручную менять не нужно',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 5,
  },
  {
    key: 'home_news_per_page',
    value: '4',
    groupName: 'homepage',
    label: 'Сколько новостей в блоке на главной',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 20,
  },
  {
    key: 'home_news_rss_url',
    value: '',
    groupName: 'homepage',
    label: 'RSS/Atom URL для импорта новостей (кнопка «Импорт RSS» в админке → Новости; пусто — только ручной URL в запросе)',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 21,
  },
  {
    key: 'trust_sync_title',
    value: 'Еженедельно',
    groupName: 'homepage',
    label: 'Trust strip: заголовок «синхронизация»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 30,
  },
  {
    key: 'trust_sync_subtitle',
    value: 'синхронизация фида',
    groupName: 'homepage',
    label: 'Trust strip: подпись синхронизации',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 31,
  },
  {
    key: 'trust_verified_title',
    value: 'Проверенные данные',
    groupName: 'homepage',
    label: 'Trust strip: заголовок «проверенные данные»',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 32,
  },
  {
    key: 'trust_verified_subtitle',
    value: 'из официального фида',
    groupName: 'homepage',
    label: 'Trust strip: подпись проверенных данных',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 33,
  },
  {
    key: 'about_platform_image',
    value: '',
    groupName: 'homepage',
    label: 'Фото блока «О платформе»',
    fieldType: SiteSettingFieldType.IMAGE,
    sortOrder: 40,
  },
  {
    key: 'contact_block_image',
    value: '',
    groupName: 'homepage',
    label: 'Фото блока «Свяжитесь с нами»',
    fieldType: SiteSettingFieldType.IMAGE,
    sortOrder: 41,
  },
];

/** SEO keys — synced with packages/database/prisma/seed.ts group `seo`. */
export const DEFAULT_SEO_SITE_SETTINGS: Array<{
  key: string;
  value: string;
  groupName: string;
  label: string;
  fieldType: SiteSettingFieldType;
  sortOrder: number;
}> = [
  {
    key: 'site_title',
    value: 'LiveGrid — агрегатор новостроек',
    groupName: 'seo',
    label: 'Title сайта',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 0,
  },
  {
    key: 'meta_description',
    value: '',
    groupName: 'seo',
    label: 'Meta Description',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 1,
  },
  {
    key: 'og_image',
    value: '',
    groupName: 'seo',
    label: 'OG Image URL',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 2,
  },
];

/** CMS-managed SEO landing copy — group `seo_landings`, no AI generation. */
export const DEFAULT_SEO_LANDING_SETTINGS: Array<{
  key: string;
  value: string;
  groupName: string;
  label: string;
  fieldType: SiteSettingFieldType;
  sortOrder: number;
}> = [
  {
    key: 'seo_landing_district_intro',
    value:
      'Квартиры и новостройки в районе {district}{regionSuffix}. Актуальные объекты из официального фида застройщиков на LiveGrid.',
    groupName: 'seo_landings',
    label: 'Шаблон intro: район (плейсхолдеры {district}, {region}, {regionSuffix})',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 0,
  },
  {
    key: 'seo_landing_subway_intro',
    value:
      'Недвижимость у метро {subway}{regionSuffix}: новостройки и квартиры с фильтрами и картой.',
    groupName: 'seo_landings',
    label: 'Шаблон intro: метро (плейсхолдеры {subway}, {region}, {regionSuffix})',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 1,
  },
  {
    key: 'seo_landing_region_intro',
    value:
      'Каталог недвижимости{regionSuffix}: жилые комплексы, квартиры, фильтры по району и сроку сдачи.',
    groupName: 'seo_landings',
    label: 'Шаблон intro: регион ({region}, {regionSuffix})',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 2,
  },
  {
    key: 'seo_landing_faq_json',
    value: JSON.stringify(
      [
        {
          q: 'Откуда данные о квартирах?',
          a: 'Объекты синхронизируются из официального фида застройщиков и обновляются регулярно.',
        },
        {
          q: 'Как оставить заявку?',
          a: 'Выберите объект и нажмите «Запросить консультацию» — менеджер свяжется в течение 2 часов.',
        },
      ],
      null,
      0,
    ),
    groupName: 'seo_landings',
    label: 'FAQ для SEO-лендингов каталога (JSON-массив {q,a})',
    fieldType: SiteSettingFieldType.TEXTAREA,
    sortOrder: 3,
  },
];

/** Группа настроек интеграций: не отдаётся в публичном API, редактирование секретов — только admin. */
export const INTEGRATIONS_SITE_SETTINGS_GROUP = 'integrations';

/** Telegram и др.: только БД + админ-панель (без переменных окружения). */
export const DEFAULT_INTEGRATION_SITE_SETTINGS: Array<{
  key: string;
  value: string;
  groupName: string;
  label: string;
  fieldType: SiteSettingFieldType;
  sortOrder: number;
}> = [
  {
    key: 'telegram_bot_token',
    value: '',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Telegram: токен бота (выдаёт BotFather)',
    fieldType: SiteSettingFieldType.SECRET,
    sortOrder: 0,
  },
  {
    key: 'telegram_login_bot_username',
    value: '',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Telegram Login: username бота без @ (для виджета на сайте)',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 1,
  },
  {
    key: 'yandex_maps_api_key',
    value: '',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label:
      'Yandex Maps: JavaScript API Key (публичный ключ для сайта; в кабинете разработчика ограничьте по HTTP Referrer)',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 2,
  },
  {
    key: 'telegram_bot_internal_secret',
    value: '',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Telegram bot: внутренний секрет для обновления токена (x-telegram-bot-secret)',
    fieldType: SiteSettingFieldType.SECRET,
    sortOrder: 3,
  },
  {
    key: 'contacts_email',
    value: 'info@livegrid.ru',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Контакты бота: Email',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 4,
  },
  {
    key: 'contacts_address',
    value: 'Белгород, офис Live Grid',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Контакты бота: Адрес',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 5,
  },
  {
    key: 'contacts_work_hours',
    value: 'пн–пт 9:00–18:00',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Контакты бота: Режим работы',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 6,
  },
  {
    key: 'tg_news_mtproto_session',
    value: '',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'MTProto: string session (импорт новостей из Telegram; задаётся через QR в разделе Новости)',
    fieldType: SiteSettingFieldType.SECRET,
    sortOrder: 15,
  },
  {
    key: 'listing_moderation_enabled',
    value: 'false',
    groupName: INTEGRATIONS_SITE_SETTINGS_GROUP,
    label: 'Объявления: модерация перед публикацией (агенты отправляют на review)',
    fieldType: SiteSettingFieldType.TEXT,
    sortOrder: 16,
  },
];

/**
 * Обложки — статика с сайта (`apps/web/public/news/covers/`, как в strict-template).
 * Относительные пути: без внешних CDN (часто блокируются).
 */
export const DEFAULT_DEMO_NEWS: Array<{
  slug: string;
  title: string;
  body: string;
  source: string;
  imageUrl: string | null;
}> = [
  {
    slug: 'obzor-novostroek-moskvy-2026',
    title: 'Обзор новостроек Москвы: что выбрать',
    body: '<p>Краткий обзор рынка новостроек Москвы и Московской области.</p>',
    source: 'Обзор',
    imageUrl: '/news/covers/construction.jpg',
  },
  {
    slug: 'ipoteka-stavki-snizheny-2026',
    title: 'Ипотечные ставки снижены до 6%',
    body: '<p>Обзор актуальных ипотечных программ и условий банков.</p>',
    source: 'Ипотека',
    imageUrl: '/news/covers/office.jpg',
  },
  {
    slug: 'novyj-zhk-na-yuge-moskvy',
    title: 'Новый жилой комплекс на юге Москвы',
    body: '<p>Анонс нового проекта на юге столицы.</p>',
    source: 'Новостройки',
    imageUrl: '/news/covers/complex.jpg',
  },
  {
    slug: 'kak-vybrat-kvartiru-sovety',
    title: 'Как выбрать квартиру: советы экспертов',
    body: '<p>Практические рекомендации при выборе квартиры в новостройке.</p>',
    source: 'Советы',
    imageUrl: '/news/covers/interior.jpg',
  },
  {
    slug: 'rynok-novostroek-prognoz-2026',
    title: 'Прогноз по рынку новостроек на 2026 год',
    body: '<p>Что ждёт покупателей: спрос, цены и география запусков.</p>',
    source: 'Аналитика',
    imageUrl: '/news/covers/office.jpg',
  },
  {
    slug: 'samoletnye-programmy-rassrochki',
    title: 'Рассрочка и trade-in: какие программы актуальны',
    body: '<p>Краткий обзор условий застройщиков и банковских партнёров.</p>',
    source: 'Финансы',
    imageUrl: '/news/covers/construction.jpg',
  },
];
