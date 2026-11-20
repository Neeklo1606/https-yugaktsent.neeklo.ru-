import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string | undefined)?.trim() || 'ЮгАкцент';
const SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://yugaktsent.neeklo.ru';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

const JSON_LD_ID = 'lg-seo-jsonld';

function isNoindexPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/favorites')
  );
}

/** Entity pages inject richer JSON-LD via useEntitySeoMeta */
function isEntityDetailPath(pathname: string): boolean {
  return (
    pathname.startsWith('/complex/') ||
    pathname.startsWith('/apartment/') ||
    pathname.startsWith('/listing/')
  );
}

function breadcrumbLabel(segment: string, index: number, segments: string[]): string {
  if (index === 0 && segment === 'catalog') return 'Каталог';
  if (segment === 'complex') return 'ЖК';
  if (segment === 'apartment') return 'Квартира';
  if (segment === 'map') return 'Карта';
  if (segment === 'agency') return 'Агентство';
  if (segment === 'agent') return 'Агент';
  if (segment === 'selections') return 'Подборка';
  if (segment === 'news') return 'Новости';
  if (index === segments.length - 1 && segments[0] === 'complex') return 'Жилой комплекс';
  if (index === segments.length - 1 && segments[0] === 'apartment') return 'Квартира';
  if (index === segments.length - 1 && segments[0] === 'agency') return 'Агентство';
  if (index === segments.length - 1 && segments[0] === 'agent') return 'Агент';
  return segment;
}

function buildJsonLd(pathname: string): Record<string, unknown>[] {
  const canonicalUrl = `${SITE_URL}${pathname}`;
  const graphs: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: DEFAULT_OG_IMAGE,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/catalog?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const items = [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
    ];
    let acc = '';
    segments.forEach((seg, i) => {
      acc += `/${seg}`;
      items.push({
        '@type': 'ListItem',
        position: i + 2,
        name: breadcrumbLabel(seg, i, segments),
        item: `${SITE_URL}${acc}`,
      });
    });
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items,
    });
  }

  if (pathname.startsWith('/apartment/')) {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'Apartment',
      url: canonicalUrl,
      name: `Квартира · ${SITE_NAME}`,
    });
  } else if (pathname.startsWith('/complex/')) {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'Residence',
      url: canonicalUrl,
      name: `Жилой комплекс · ${SITE_NAME}`,
    });
  } else {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      url: canonicalUrl,
      name: SITE_NAME,
      isPartOf: { '@type': 'WebSite', url: SITE_URL },
    });
  }

  return graphs;
}

export default function SeoJsonLd() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (isNoindexPath(pathname) || isEntityDetailPath(pathname)) {
      document.getElementById(JSON_LD_ID)?.remove();
      return;
    }

    let el = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
    // Разметка из пререндера (главная: агентство с телефоном и адресом) полнее клиентской — оставляем её
    if (el && el.dataset.path === pathname) return;
    if (el) delete el.dataset.path;
    if (!el) {
      el = document.createElement('script');
      el.id = JSON_LD_ID;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(buildJsonLd(pathname));
  }, [pathname]);

  return null;
}
