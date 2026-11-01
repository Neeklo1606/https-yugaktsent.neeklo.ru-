import { useEffect } from 'react';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { withoutLegacyBrand } from '@/shared/lib/site-brand-text';

const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru';

export type EntitySeoInput = {
  title: string;
  description: string;
  pathname: string;
  imageUrl?: string | null;
  jsonLd?: Record<string, unknown>;
};

function setMeta(name: string, content: string, property = false) {
  const sel = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let el = document.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    if (property) el.setAttribute('property', name);
    else el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

const ENTITY_JSON_LD_ID = 'lg-entity-seo-jsonld';

/**
 * Page-level entity SEO — complex/apartment detail pages (Iter 64).
 * Client-side only; no SSR rewrite.
 */
export function useEntitySeoMeta(input: EntitySeoInput | null) {
  const { shortName } = useSiteBrand();

  useEffect(() => {
    if (!input) return;

    const siteName = shortName;
    const title = withoutLegacyBrand(input.title, siteName);
    const description = withoutLegacyBrand(input.description, siteName);
    const fullTitle = `${title} | ${siteName}`;
    const canonical = `${SITE_URL}${input.pathname}`;
    const image = input.imageUrl?.trim() || `${SITE_URL}/og-default.jpg`;

    document.title = fullTitle;
    setMeta('description', description);
    setMeta('robots', 'index, follow');
    setMeta('og:title', fullTitle, true);
    setMeta('og:description', description, true);
    setMeta('og:url', canonical, true);
    setMeta('og:type', 'website', true);
    setMeta('og:image', image, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image', image);
    setCanonical(canonical);

    if (input.jsonLd) {
      let el = document.getElementById(ENTITY_JSON_LD_ID) as HTMLScriptElement | null;
      if (!el) {
        el = document.createElement('script');
        el.id = ENTITY_JSON_LD_ID;
        el.type = 'application/ld+json';
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(input.jsonLd);
    }

    return () => {
      document.getElementById(ENTITY_JSON_LD_ID)?.remove();
    };
  }, [input?.title, input?.description, input?.pathname, input?.imageUrl, input?.jsonLd, shortName]);
}

/** «Не найдено» отвечает 200 (SPA), поэтому прячем такую страницу от поисковиков мета-тегом */
export function useNoIndex(active: boolean) {
  useEffect(() => {
    if (active) setMeta('robots', 'noindex, nofollow');
  }, [active]);
}
