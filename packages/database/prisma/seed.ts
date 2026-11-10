import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Feed Regions ---
  const msk = await prisma.feedRegion.upsert({
    where: { code: 'msk' },
    update: {},
    create: { code: 'msk', name: 'Москва', baseUrl: 'https://dataout.trendagent.ru/msk', isEnabled: true },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'mo' },
    update: {},
    create: {
      code: 'mo',
      name: 'Московская область',
      baseUrl: 'https://dataout.trendagent.ru/mo',
      isEnabled: false,
    },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'belgorod' },
    update: {},
    create: {
      code: 'belgorod',
      name: 'Белгород',
      baseUrl: 'https://dataout.trendagent.ru/belgorod',
      isEnabled: true,
    },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'spb' },
    update: {},
    create: { code: 'spb', name: 'Санкт-Петербург', baseUrl: 'https://dataout.trendagent.ru/spb' },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'krd' },
    update: {},
    create: { code: 'krd', name: 'Краснодар', baseUrl: 'https://dataout.trendagent.ru/krd' },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'ekb' },
    update: {},
    create: { code: 'ekb', name: 'Екатеринбург', baseUrl: 'https://dataout.trendagent.ru/ekb' },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'nsk' },
    update: {},
    create: { code: 'nsk', name: 'Новосибирск', baseUrl: 'https://dataout.trendagent.ru/nsk' },
  });
  await prisma.feedRegion.upsert({
    where: { code: 'kzn' },
    update: {},
    create: { code: 'kzn', name: 'Казань', baseUrl: 'https://dataout.trendagent.ru/kzn' },
  });
  console.log('  Feed regions seeded');

  // --- Администратор ---
  // Сид выполняется при каждом деплое, поэтому пароля по умолчанию здесь быть не должно:
  // иначе на проде живёт всем известная учётка. Создаём админа только по явному запросу.
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (seedAdminEmail && seedAdminPassword) {
    if (seedAdminPassword.length < 12) {
      throw new Error('SEED_ADMIN_PASSWORD короче 12 символов — слишком слабый пароль для администратора');
    }
    const passwordHash = await bcrypt.hash(seedAdminPassword, 12);
    await prisma.user.upsert({
      where: { email: seedAdminEmail },
      update: {},
      create: {
        email: seedAdminEmail,
        fullName: 'Администратор',
        passwordHash,
        role: 'admin',
      },
    });
    console.log(`  Админ создан: ${seedAdminEmail} (пароль из SEED_ADMIN_PASSWORD)`);
  } else {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    console.log(
      adminCount > 0
        ? `  Админов в базе: ${adminCount} — сид никого не создаёт`
        : '  Админ не создан: задайте SEED_ADMIN_EMAIL и SEED_ADMIN_PASSWORD, чтобы завести первого',
    );
  }

  // --- Site Settings ---
  const settings = [
    { key: 'company_name', value: 'ЮгАкцент', groupName: 'company', label: 'Название компании', fieldType: 'TEXT' as const, sortOrder: 0 },
    { key: 'inn', value: '', groupName: 'company', label: 'ИНН', fieldType: 'TEXT' as const, sortOrder: 1 },
    { key: 'ogrn', value: '', groupName: 'company', label: 'ОГРН', fieldType: 'TEXT' as const, sortOrder: 2 },
    { key: 'copyright_year', value: '2026', groupName: 'company', label: 'Год в copyright', fieldType: 'TEXT' as const, sortOrder: 3 },
    { key: 'phone_main', value: '+7 (904) 539-34-34', groupName: 'contacts', label: 'Основной телефон', fieldType: 'PHONE' as const, sortOrder: 0 },
    { key: 'phone_secondary', value: '', groupName: 'contacts', label: 'Дополнительный телефон', fieldType: 'PHONE' as const, sortOrder: 1 },
    { key: 'email', value: 'info@yugaktsent.ru', groupName: 'contacts', label: 'Email', fieldType: 'EMAIL' as const, sortOrder: 2 },
    { key: 'address', value: '', groupName: 'contacts', label: 'Адрес офиса', fieldType: 'TEXTAREA' as const, sortOrder: 3 },
    { key: 'work_hours', value: 'Пн-Пт 9:00-18:00', groupName: 'contacts', label: 'Часы работы', fieldType: 'TEXT' as const, sortOrder: 4 },
    { key: 'telegram_url', value: '', groupName: 'social', label: 'Telegram', fieldType: 'URL' as const, sortOrder: 0 },
    { key: 'vk_url', value: '', groupName: 'social', label: 'ВКонтакте', fieldType: 'URL' as const, sortOrder: 1 },
    { key: 'youtube_url', value: '', groupName: 'social', label: 'YouTube', fieldType: 'URL' as const, sortOrder: 2 },
    { key: 'ok_url', value: '', groupName: 'social', label: 'Одноклассники', fieldType: 'URL' as const, sortOrder: 3 },
    { key: 'site_title', value: 'ЮгАкцент — новостройки Анапы', groupName: 'seo', label: 'Title сайта', fieldType: 'TEXT' as const, sortOrder: 0 },
    { key: 'meta_description', value: '', groupName: 'seo', label: 'Meta Description', fieldType: 'TEXTAREA' as const, sortOrder: 1 },
    { key: 'og_image', value: '', groupName: 'seo', label: 'OG Image URL', fieldType: 'IMAGE' as const, sortOrder: 2 },
    { key: 'office_lat', value: '44.8956', groupName: 'map', label: 'Широта офиса', fieldType: 'TEXT' as const, sortOrder: 0 },
    { key: 'office_lng', value: '37.3163', groupName: 'map', label: 'Долгота офиса', fieldType: 'TEXT' as const, sortOrder: 1 },
    { key: 'office_title', value: 'Офис Южный Акцент', groupName: 'map', label: 'Подпись на карте', fieldType: 'TEXT' as const, sortOrder: 2 },
    // Главная: «Горячие предложения» и «Старт продаж» (редактируются в админке → Настройки сайта)
    { key: 'home_hot_title', value: 'Горячие предложения', groupName: 'homepage', label: 'Заголовок блока «Горячие предложения»', fieldType: 'TEXT' as const, sortOrder: 0 },
    { key: 'home_hot_per_page', value: '8', groupName: 'homepage', label: 'Сколько карточек в «Горячих предложениях»', fieldType: 'TEXT' as const, sortOrder: 1 },
    { key: 'home_hot_mode', value: 'latest', groupName: 'homepage', label: 'Режим горячих: latest — последние ЖК с офферами; promoted — флаг «Реклама»; fixed_slugs — список slug ниже', fieldType: 'TEXT' as const, sortOrder: 2 },
    { key: 'home_hot_fixed_slugs', value: '', groupName: 'homepage', label: 'Фиксированные slug ЖК (через запятую), если режим fixed_slugs', fieldType: 'TEXTAREA' as const, sortOrder: 3 },
    { key: 'home_hot_badge', value: 'Горячее предложение', groupName: 'homepage', label: 'Текст бейджа на карточке «Горячие»', fieldType: 'TEXT' as const, sortOrder: 4 },
    { key: 'home_start_title', value: 'Старт продаж', groupName: 'homepage', label: 'Заголовок блока «Старт продаж»', fieldType: 'TEXT' as const, sortOrder: 10 },
    { key: 'home_start_per_page', value: '8', groupName: 'homepage', label: 'Сколько карточек в «Старте продаж»', fieldType: 'TEXT' as const, sortOrder: 11 },
    { key: 'home_start_window_days', value: '365', groupName: 'homepage', label: 'Окно дней: дата старта продаж от сегодня до +N дней', fieldType: 'TEXT' as const, sortOrder: 12 },
    { key: 'home_start_badge', value: 'Старт продаж', groupName: 'homepage', label: 'Текст бейджа «Старт продаж»', fieldType: 'TEXT' as const, sortOrder: 13 },
    { key: 'home_banners', value: '[]', groupName: 'homepage', label: 'Слайды баннера на главной (JSON). Редактируется в админке → «Главная: баннеры»', fieldType: 'TEXTAREA' as const, sortOrder: 5 },
    { key: 'home_news_per_page', value: '4', groupName: 'homepage', label: 'Сколько новостей в блоке на главной', fieldType: 'TEXT' as const, sortOrder: 20 },
    {
      key: 'home_news_rss_url',
      value: '',
      groupName: 'homepage',
      label: 'RSS/Atom URL для импорта новостей (админка → Новости → Импорт RSS)',
      fieldType: 'TEXT' as const,
      sortOrder: 21,
    },
    {
      key: 'telegram_bot_token',
      value: '',
      groupName: 'integrations',
      label: 'Telegram: токен бота (BotFather)',
      fieldType: 'SECRET' as const,
      sortOrder: 0,
    },
    {
      key: 'telegram_notify_chat_id',
      value: '',
      groupName: 'integrations',
      label: 'Telegram: ID чата для уведомлений о заявках',
      fieldType: 'TEXT' as const,
      sortOrder: 1,
    },
    {
      key: 'telegram_login_bot_username',
      value: '',
      groupName: 'integrations',
      label: 'Telegram Login: username бота без @',
      fieldType: 'TEXT' as const,
      sortOrder: 2,
    },
    {
      key: 'yandex_maps_api_key',
      value: '',
      groupName: 'integrations',
      label: 'Yandex Maps: JavaScript API Key (ограничить по HTTP Referrer)',
      fieldType: 'TEXT' as const,
      sortOrder: 3,
    },
    {
      key: 'tg_news_mtproto_session',
      value: '',
      groupName: 'integrations',
      label: 'MTProto: string session (импорт новостей из Telegram; QR в админке → Новости)',
      fieldType: 'SECRET' as const,
      sortOrder: 15,
    },
  ];

  for (const s of settings) {
    await prisma.siteSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log('  Site settings seeded');

  // --- Navigation Menus ---
  await prisma.navigationMenu.upsert({
    where: { location: 'header_main' },
    update: {},
    create: { location: 'header_main', label: 'Главное меню' },
  });
  await prisma.navigationMenu.upsert({
    where: { location: 'footer' },
    update: {},
    create: { location: 'footer', label: 'Подвал сайта' },
  });
  console.log('  Navigation menus seeded');

  // --- Demo news (same themes as former static homepage block; visible in /admin/news and on the site) ---
  const demoNews = [
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
      imageUrl: 'https://picsum.photos/seed/livegrid-news-ipoteka/800/480',
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
      imageUrl: 'https://picsum.photos/seed/livegrid-news-sovety/800/480',
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
  // Demo news are LiveGrid template content (Moscow). Never publish them on a client site
  // unless explicitly requested for a local demo: SEED_DEMO_NEWS=1.
  const seedDemoNews = process.env.SEED_DEMO_NEWS === '1';
  const now = new Date();
  for (let i = 0; seedDemoNews && i < demoNews.length; i++) {
    const n = demoNews[i];
    const publishedAt = new Date(now);
    publishedAt.setDate(publishedAt.getDate() - (demoNews.length - i));
    await prisma.news.upsert({
      where: { slug: n.slug },
      update: {
        title: n.title,
        body: n.body,
        source: n.source,
        imageUrl: n.imageUrl,
        isPublished: true,
        publishedAt,
      },
      create: {
        slug: n.slug,
        title: n.title,
        body: n.body,
        source: n.source,
        imageUrl: n.imageUrl,
        isPublished: true,
        publishedAt,
      },
    });
  }
  console.log(seedDemoNews ? '  Demo news seeded (6 articles, published)' : '  Demo news skipped (SEED_DEMO_NEWS!=1)');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
