import type { SyntheticEvent } from 'react';
import { BRAND_LOGO_SRC } from '@/redesign/lib/branding';

/** Generic SVG placeholder in public/ */
export const IMAGE_PLACEHOLDER = '/placeholder.svg';

/** Branded logo fallback for listing thumbnails */
export const IMAGE_LOGO_SRC = BRAND_LOGO_SRC;

export const MEDIA_ASPECT = {
  card: 'aspect-video', // 16:9
  sidebar: 'aspect-[4/3]',
  popup: 'aspect-video', // 16:9
} as const;

export function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.length > 0 && trimmed !== IMAGE_PLACEHOLDER;
}

/** True when UI should skip network load and show fallback immediately. */
export function shouldUseFallbackImage(url: unknown): boolean {
  return !isValidImageUrl(url);
}

/** Resolve URL for <img src> — never returns empty string. */
export function getSafeImageUrl(url: unknown, fallback: string = IMAGE_PLACEHOLDER): string {
  return isValidImageUrl(url) ? url.trim() : fallback;
}

/**
 * One-shot img onError handler — swaps to fallback without infinite loop.
 * Prefer StableMediaFrame for new code.
 */
export function handleImageError(
  event: SyntheticEvent<HTMLImageElement, Event>,
  fallback: string = IMAGE_PLACEHOLDER,
): void {
  const el = event.currentTarget;
  if (el.dataset.lgMediaFallback === '1') return;
  el.dataset.lgMediaFallback = '1';
  el.onerror = null;
  el.src = fallback;
}

/** Decorative catalog/card images use empty alt; provide context when known. */
export function imageAltText(context?: string | null, decorative = true): string {
  if (decorative) return '';
  return context?.trim() ?? '';
}

/** Ширины, которые отдаёт ресайзер nginx `/img/<w>/…` */
export const IMAGE_PROXY_WIDTHS = [480, 800, 1280] as const;

const PROFITBASE_RE = /^https?:\/\/(pb\d+(?:\.tochno)?)\.profitbase\.ru\/(uploads\/.+)$/i;

/**
 * Фото Profitbase приходят оригиналами по 0,3–4 МБ. При включённом ресайзере
 * (`VITE_IMAGE_PROXY=1`, nginx + image_filter с кэшем) отдаём уменьшенные копии.
 */
export function proxiedImageUrl(url: string, width: number): string | null {
  if (import.meta.env.VITE_IMAGE_PROXY !== '1') return null;
  const m = PROFITBASE_RE.exec(url.trim());
  if (!m) return null;
  return `/img/${width}/${m[1]}/${m[2]}`;
}

/** srcSet для <img>, либо undefined, если ресайзер к этому адресу не применим */
export function imageSrcSet(url: unknown): string | undefined {
  if (!isValidImageUrl(url)) return undefined;
  const parts = IMAGE_PROXY_WIDTHS.map((w) => {
    const u = proxiedImageUrl(url, w);
    return u ? `${u} ${w}w` : null;
  });
  return parts.every(Boolean) ? parts.join(', ') : undefined;
}
