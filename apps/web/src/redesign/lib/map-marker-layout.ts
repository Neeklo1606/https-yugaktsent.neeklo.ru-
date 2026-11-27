import {
  formatMarkerPriceFrom,
  normalizePriceValue,
  PRICE_ON_REQUEST,
} from '@/redesign/lib/display-price';

/** Цвет меток карты — акцент бренда, не собственная палитра */
import { BRAND_PRIMARY_HEX, BRAND_PRIMARY_ACTIVE_HEX } from '@/redesign/lib/button-styles';

export const MARKER_ACCENT = BRAND_PRIMARY_HEX;
export const MARKER_ACCENT_ACTIVE = BRAND_PRIMARY_ACTIVE_HEX;

/** С этого масштаба метки — с ценой «от X млн» (раньше с 12: на обзоре города были одни точки) */
export const ZOOM_DOT_MAX = 9;
export const ZOOM_NAME_MIN = 14;

export type MarkerZoomMode = 'dot' | 'price' | 'name';

export function zoomToMarkerMode(zoom: number): MarkerZoomMode {
  if (zoom > ZOOM_NAME_MIN) return 'name';
  if (zoom >= ZOOM_DOT_MAX) return 'price';
  return 'dot';
}

/** @deprecated Use formatMarkerPriceFrom from display-price */
export function formatMarkerPriceFromRub(price: number | null | undefined): string {
  return formatMarkerPriceFrom(price);
}

export function parseListingPriceRub(value: string | number | null | undefined): number | null {
  return normalizePriceValue(value);
}

export function escapeMarkerHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function truncateMarkerLabel(text: string, maxLen = 22): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

type MarkerLayoutOptions = {
  mode: MarkerZoomMode;
  label: string | null;
  isActive: boolean;
};

/** Yandex templateLayoutFactory HTML for a map marker */
export function buildMarkerLayoutHtml({ mode, label, isActive }: MarkerLayoutOptions): string {
  const color = isActive ? MARKER_ACCENT_ACTIVE : MARKER_ACCENT;
  const dotSize = mode === 'dot' ? (isActive ? 18 : 16) : 20;
  const shadow = '0 4px 14px rgba(23, 79, 68, 0.35)';

  if (mode === 'dot') {
    return `<div style="
      width: ${dotSize}px;
      height: ${dotSize}px;
      border-radius: 999px;
      background: ${color};
      border: 2px solid #ffffff;
      box-shadow: ${shadow};
      cursor: pointer;
      transform: translate(-50%, -50%);
    "></div>`;
  }

  const safeLabel = escapeMarkerHtml(truncateMarkerLabel(label ?? PRICE_ON_REQUEST));
  return `<div style="
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    transform: translate(-50%, -100%);
    pointer-events: auto;
  ">
    <div style="
      width: ${dotSize}px;
      height: ${dotSize}px;
      border-radius: 999px;
      background: ${color};
      border: 2px solid #ffffff;
      box-shadow: ${shadow};
      flex-shrink: 0;
    "></div>
    <div style="
      margin-top: 4px;
      max-width: 120px;
      background: #ffffff;
      color: #0f172a;
      padding: 4px 9px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.25;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
      border: 1px solid rgba(15, 23, 42, 0.08);
    ">${safeLabel}</div>
  </div>`;
}

export function markerIconShape(mode: MarkerZoomMode): { type: 'Rectangle'; coordinates: [[number, number], [number, number]] } {
  if (mode === 'dot') {
    return {
      type: 'Rectangle',
      coordinates: [
        [-10, -10],
        [10, 10],
      ],
    };
  }
  return {
    type: 'Rectangle',
    coordinates: [
      [-48, -36],
      [48, 8],
    ],
  };
}
