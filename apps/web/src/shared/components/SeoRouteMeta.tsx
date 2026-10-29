import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { catalogFiltersFromSearchParams } from '@/redesign/lib/catalog-url-sync';
import { buildCatalogSeoMeta } from '@/redesign/lib/catalog-seo-meta';
import { useSiteSettings, setting, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { siteBrandFromMap } from '@/redesign/hooks/useSiteBrand';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { getExpert } from '@/shared/experts/expert-profile';

const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

type SeoMeta = {
  title: string;
  description: string;
  noindex?: boolean;
  ogImage?: string;
};

function ensureMetaByName(name: string): HTMLMetaElement {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  return meta;
}

function ensureMetaByProperty(property: string): HTMLMetaElement {
  let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }
  return meta;
}

function ensureCanonical(): HTMLLinkElement {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  return link;
}

function stripSiteSuffix(title: string, siteName: string): string {
  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*\\|\\s*${escaped}\\s*$`, 'i'), '').trim();
}

function resolveRegionName(
  search: string,
  regionId: number | undefined,
  rows: { id: number; name?: string }[] | undefined,
): string | null {
  const sp = new URLSearchParams(search);
  const fromUrl = sp.get('region_id');
  const id = fromUrl ? Number(fromUrl) : regionId;
  if (!id || !Number.isFinite(id) || !rows?.length) return null;
  return rows.find((r) => r.id === id)?.name?.trim() ?? null;
}

function buildMeta(
  pathname: string,
  search: string,
  cms: Map<string, string> | undefined,
  regionName: string | null,
  siteName: string,
): SeoMeta {
  if (pathname === '/') {
    const cmsTitle = settingOptional(cms, 'site_title');
    const cmsDesc = settingOptional(cms, 'meta_description');
    const ogImage = settingOptional(cms, 'og_image');
    const defaultTitle = regionName
      ? `Недвижимость в ${regionName}`
      : `Недвижимость в Анапе · ${siteName}`;
    const defaultDesc = regionName
      ? `Каталог жилых комплексов и квартир в ${regionName}: фильтры, карта, избранное и подборки.`
      : `Каталог жилых комплексов и квартир: фильтры, карты, избранное и подборки.`;
    return {
      title: cmsTitle ? stripSiteSuffix(cmsTitle, siteName) : defaultTitle,
      description: cmsDesc || defaultDesc,
      ogImage: ogImage ? (ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`) : undefined,
    };
  }
  if (pathname.startsWith('/catalog')) {
    const sp = new URLSearchParams(search);
    const filters = catalogFiltersFromSearchParams(sp);
    const page = Math.max(1, Number(sp.get('page') || 1) || 1);
    const sort = sp.get('sort');
    return buildCatalogSeoMeta(filters.search, filters, { page, sort, regionName, siteName });
  }
  if (pathname.startsWith('/listing/')) {
    return {
      title: 'Объект недвижимости',
      description: `Планировка, площадь, этаж, срок сдачи и цена. Консультация и показ: ${siteName}, Анапа.`,
    };
  }
  if (pathname.startsWith('/complex/')) {
    return {
      title: 'Страница жилого комплекса',
      description: 'Описание ЖК, квартиры, планировки, шахматка и инфраструктура.',
    };
  }
  if (pathname.startsWith('/apartment/')) {
    return {
      title: 'Карточка квартиры',
      description: 'Параметры квартиры, планировка, цена и связанные объекты.',
    };
  }
  if (pathname.startsWith('/map')) {
    const mapTitle = regionName ? `Поиск на карте · ${regionName}` : 'Поиск на карте';
    const mapDesc = regionName
      ? `Поиск жилых комплексов и объектов в ${regionName} на интерактивной карте.`
      : 'Поиск жилых комплексов и объектов на интерактивной карте.';
    return { title: mapTitle, description: mapDesc };
  }
  if (pathname.startsWith('/agency/')) {
    return {
      title: 'Агентство недвижимости',
      description: `Профиль агентства: команда, объекты и контакты на ${siteName}.`,
    };
  }
  if (pathname.startsWith('/agent/')) {
    return {
      title: 'Агент по недвижимости',
      description: 'Профиль агента: специализация, объекты и способы связи.',
    };
  }
  if (pathname.startsWith('/selections/')) {
    return {
      title: 'Подборка объектов',
      description: 'Персональная подборка квартир и ЖК, подготовленная экспертом.',
    };
  }
  if (pathname.startsWith('/news')) {
    return {
      title: 'Новости недвижимости',
      description: 'Актуальные новости и статьи о рынке недвижимости и проектах.',
    };
  }
  if (pathname === '/contacts') {
    return {
      title: 'Контакты',
      description: setting(
        cms,
        'contacts_meta_description',
        `Офис ${siteName} в Анапе: адрес на карте, телефон, график работы. Консультация по подбору новостроек бесплатная.`,
      ),
    };
  }
  if (pathname === '/privacy') {
    return {
      title: 'Политика конфиденциальности',
      description: `Условия обработки персональных данных на сайте ${siteName}.`,
    };
  }
  if (pathname === '/about') {
    return {
      title: 'О компании',
      description: `${siteName}, агентство недвижимости в Анапе: подбор новостроек, проверка документов, сопровождение сделки и помощь с ипотекой.`,
    };
  }
  if (pathname.startsWith('/experts/')) {
    const expert = getExpert(pathname.slice('/experts/'.length).replace(/\/+$/, ''));
    if (expert?.published) return { title: expert.seo.title, description: expert.seo.description };
  }
  if (pathname.startsWith('/presentation/')) {
    return {
      title: 'Презентация комплекса',
      description: `Цены, сроки сдачи и планировки комплекса одним файлом от ${siteName}.`,
      noindex: true,
    };
  }
  if (pathname === '/cookies') {
    return {
      title: 'Политика использования cookie',
      description: `Какие cookie и данные браузера использует сайт ${siteName} и как их отключить.`,
    };
  }
  if (pathname === '/terms') {
    return {
      title: 'Пользовательское соглашение',
      description: `Условия использования сайта ${siteName}.`,
    };
  }
  if (pathname === '/compare') {
    return {
      title: 'Сравнение объектов',
      description: 'Сравнение выбранных жилых комплексов по цене, срокам и характеристикам.',
      noindex: true,
    };
  }
  if (pathname === '/selection') {
    return {
      title: 'Подбор объекта',
      description: 'Онлайн-анкета для индивидуального подбора недвижимости.',
    };
  }
  if (pathname.startsWith('/favorites')) {
    return { title: 'Избранное', description: `Сохранённые объекты на сайте ${siteName}.`, noindex: true };
  }
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/profile')
  ) {
    return {
      title: 'Служебный раздел',
      description: `Служебный раздел ${siteName}.`,
      noindex: true,
    };
  }
  // Сюда попадают только неизвестные адреса — это страница 404
  return {
    title: 'Страница не найдена',
    description: `Такой страницы на сайте ${siteName} нет. Вернитесь в каталог новостроек Анапы или на главную.`,
    noindex: true,
  };
}

export default function SeoRouteMeta() {
  const { pathname, search } = useLocation();
  const { data: siteSettings } = useSiteSettings();
  const { data: defaultRegionId, rows: regionRows } = useDefaultRegionId();

  const regionName = useMemo(
    () => resolveRegionName(search, defaultRegionId, regionRows),
    [search, defaultRegionId, regionRows],
  );

  const siteName = useMemo(() => siteBrandFromMap(siteSettings).shortName, [siteSettings]);

  const meta = useMemo(
    () => buildMeta(pathname, search, siteSettings, regionName, siteName),
    [pathname, search, siteSettings, regionName, siteName],
  );

  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;

  useEffect(() => {
    // Бренд в хвост добавляем только если его ещё нет в самом заголовке
    const fullTitle = meta.title.toLowerCase().includes(siteName.toLowerCase())
      ? meta.title
      : `${meta.title} | ${siteName}`;
    const sp = new URLSearchParams(search);
    if (pathname.startsWith('/catalog')) {
      sp.delete('page');
      sp.delete('sort');
    }
    const cleanSearch = sp.toString();
    const canonicalUrl = meta.noindex
      ? `${SITE_URL}${pathname}`
      : `${SITE_URL}${pathname}${cleanSearch ? `?${cleanSearch}` : ''}`;

    document.title = fullTitle;

    ensureMetaByName('description').setAttribute('content', meta.description);
    ensureMetaByName('robots').setAttribute(
      'content',
      meta.noindex ? 'noindex, nofollow' : 'index, follow',
    );

    ensureMetaByProperty('og:title').setAttribute('content', fullTitle);
    ensureMetaByProperty('og:description').setAttribute('content', meta.description);
    ensureMetaByProperty('og:url').setAttribute('content', canonicalUrl);
    ensureMetaByProperty('og:type').setAttribute('content', 'website');
    ensureMetaByProperty('og:site_name').setAttribute('content', siteName);
    ensureMetaByProperty('og:image').setAttribute('content', ogImage);
    ensureMetaByProperty('og:locale').setAttribute('content', 'ru_RU');

    ensureMetaByName('twitter:card').setAttribute('content', 'summary_large_image');
    ensureMetaByName('twitter:title').setAttribute('content', fullTitle);
    ensureMetaByName('twitter:description').setAttribute('content', meta.description);
    ensureMetaByName('twitter:image').setAttribute('content', ogImage);

    ensureCanonical().setAttribute('href', canonicalUrl);
  }, [meta, pathname, search, ogImage]);

  return null;
}
