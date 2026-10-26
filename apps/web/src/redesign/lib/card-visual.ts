import { cn } from '@/lib/utils';
import type { ResidentialComplex } from '@/redesign/data/types';
import {
  formatPriceFromExact,
  isPriceFallbackText,
  normalizePriceValue,
} from '@/redesign/lib/display-price';
import { MIN_REASONABLE_PRICE_RUB } from '@/redesign/lib/display-price';

/**
 * Shared typography + badge tokens for catalog cards and map sidebar rows.
 * Keeps hierarchy consistent without a component rewrite.
 */
export const cardVisual = {
  /** Highest — price emphasis */
  price: 'text-sm font-bold tabular-nums leading-tight text-primary',
  priceFallback: 'text-sm font-semibold tabular-nums leading-tight text-muted-foreground',
  priceGrid: 'text-[15px] font-bold tabular-nums leading-tight text-primary',
  priceGridFallback: 'text-[15px] font-semibold tabular-nums leading-tight text-muted-foreground',

  /** High — object title */
  title: 'text-sm font-semibold leading-snug text-foreground',
  titleGrid: 'text-[15px] font-semibold leading-snug text-foreground line-clamp-2',

  /** Medium — location / district */
  meta: 'text-[11px] text-muted-foreground leading-snug truncate',
  metaDot: 'text-[11px] text-muted-foreground/90 leading-snug line-clamp-1',

  /** Low — technical / counts */
  metaMuted: 'text-[10px] text-muted-foreground/75 leading-snug truncate',

  /** Map sidebar compact */
  sidebarRow: 'flex gap-2.5 p-2 rounded-xl border transition-colors min-w-0',
  sidebarThumb: 'w-[120px] shrink-0 overflow-hidden rounded-lg',
  /** Цена в одну строку нормальным кеглем — на карте она главная */
  sidebarPrice: 'text-[17px] font-bold tabular-nums leading-tight whitespace-nowrap',
  sidebarTitle: 'text-xs font-semibold leading-snug line-clamp-1 text-foreground',
  sidebarMeta: 'text-[11px] text-muted-foreground/85 truncate leading-snug',

  /** Card shell */
  cardShell: 'rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm',
  cardBody: 'p-2.5 flex flex-col gap-1 min-w-0',
  cardBodyGrid: 'p-3 flex flex-col gap-1.5 min-w-0',

  /** ЖК marketplace card */
  complexShell:
    'rounded-[20px] border border-neutral-200/80 bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-shadow duration-200 hover:shadow-lg',
  complexMedia: 'relative w-full shrink-0 overflow-hidden rounded-t-[20px] bg-muted',
  complexMediaAspect16: 'aspect-video',
  complexMediaAspect43: 'aspect-[4/3]',
  complexCoverBadge:
    'absolute left-2.5 top-2.5 z-10 rounded-lg px-2.5 py-1 text-[10px] font-semibold leading-tight shadow-md pointer-events-none',
  complexBody: 'flex flex-col gap-2.5 p-4 min-w-0',
  complexTitle: 'text-[17px] font-bold leading-[1.25] tracking-tight text-foreground line-clamp-2',
  complexMetaRow: 'flex items-start gap-2 min-w-0 text-xs text-muted-foreground leading-snug',
  complexMetaIcon: 'w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/70',
  complexMetroDot: 'w-2 h-2 shrink-0 mt-1.5 rounded-full bg-emerald-500',
  complexCompletion:
    'text-xs font-semibold text-foreground leading-snug truncate pt-0.5 pb-0.5',
  complexInventory: 'text-[11px] text-muted-foreground leading-snug mt-1',
  complexOverlayStack:
    'absolute left-2.5 bottom-2.5 z-10 flex flex-col items-start gap-1 max-w-[calc(100%-3.75rem)] pointer-events-none',
  complexOverlayPill:
    'rounded-lg bg-white/95 px-2.5 py-1 text-[10px] font-medium leading-tight text-foreground shadow-md backdrop-blur-sm dark:bg-background/92',
  complexActionBtn:
    'flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-sm transition-colors hover:bg-white dark:bg-background/80',
  complexFooter: 'flex items-center justify-between gap-2 pt-3 mt-1 border-t border-neutral-200/70 min-h-[36px]',
  complexFooterPill:
    'inline-flex h-8 min-h-8 items-center rounded-[10px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-medium text-primary',
  complexYield: 'inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400',
  dottedLabel: 'text-xs text-muted-foreground leading-none',
  dottedPrice: 'text-xs font-semibold tabular-nums text-foreground leading-none',
  dottedBlock: 'flex flex-col gap-2 pt-1',
} as const;

type BadgeVariant = 'primary' | 'secondary' | 'outline';

const BADGE_BASE = 'inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium leading-tight';

/** Normalized badge hierarchy — primary solid, secondary subtle, outline technical */
export function cardBadgeClass(
  variant: BadgeVariant,
  accent?: 'emerald' | 'amber' | 'blue' | 'green' | 'orange' | 'red' | 'muted',
): string {
  if (variant === 'primary') {
    const map = {
      emerald: 'bg-emerald-600 text-white',
      amber: 'bg-amber-600 text-white',
      blue: 'bg-primary text-primary-foreground',
      green: 'bg-primary text-primary-foreground',
      orange: 'bg-foreground text-background',
      red: 'bg-red-600 text-white',
      muted: 'bg-muted text-muted-foreground',
    } as const;
    return cn(BADGE_BASE, map[accent ?? 'blue']);
  }
  if (variant === 'secondary') {
    const map = {
      emerald: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      blue: 'bg-primary/10 text-primary',
      green: 'bg-primary/10 text-primary',
      orange: 'bg-muted text-foreground',
      red: 'bg-red-50 text-red-800',
      muted: 'bg-muted/80 text-muted-foreground',
    } as const;
    return cn(BADGE_BASE, map[accent ?? 'muted']);
  }
  const map = {
    emerald: 'border border-emerald-200 text-emerald-700 bg-background',
    amber: 'border border-amber-200 text-amber-700 bg-background',
    blue: 'border border-blue-200 text-blue-700 bg-background',
    green: 'border border-green-200 text-green-700 bg-background',
    orange: 'border border-orange-200 text-orange-700 bg-background',
    red: 'border border-red-200 text-red-700 bg-background',
    muted: 'border border-border text-muted-foreground bg-background',
  } as const;
  return cn(BADGE_BASE, map[accent ?? 'muted']);
}

/** Join metadata fragments with middle dot — skips empty parts */
export function metaDotLine(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(' · ');
}

/** Marketplace room band label for dotted price rows */
export function complexRoomBandLabel(rooms: number): string {
  if (rooms === 0) return 'Студии';
  if (rooms === 1) return '1-к.кв';
  if (rooms === 2) return '2Е-к.кв';
  if (rooms === 21) return '2-к.кв';
  if (rooms === 3) return '3-к.кв';
  return '4+-к.кв';
}

/** ISO or Date → «N кв. YYYY» */
export function formatQuarterFromDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  return `${quarter} кв. ${d.getFullYear()}`;
}

/** Top-left cover badge — «Новый ЖК» or «Старт продаж». */
export function complexCoverBadgeLabel(complex: ResidentialComplex): string | null {
  if (complex.salesStartDate?.trim()) return 'Старт продаж';
  if (complex.isPromoted) return 'Новый ЖК';
  return null;
}

function capitalizeRuMonthYear(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
}

/** Normalize deadline text to "N кв. YYYY" when possible */
export function formatCompletionQuarterText(deadline: string): string | null {
  const dl = deadline.trim();
  if (!dl || dl === '—') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dl) || dl.includes('T')) {
    return formatQuarterFromDate(dl);
  }
  const ru = dl.match(/(\d{4})\s+(\d)\s*кв(?:артал)?/i);
  if (ru) return `${ru[2]} кв. ${ru[1]}`;
  const q = dl.match(/Q([1-4])\s+(\d{4})/i);
  if (q) return `${q[1]} кв. ${q[2]}`;
  const q2 = dl.match(/(\d{4})\s+Q([1-4])/i);
  if (q2) return `${q2[2]} кв. ${q2[1]}`;
  if (dl === 'Сдан' || dl === 'Строится' || dl === 'Проект') return null;
  return dl;
}

/** Bottom-left overlay lines on ЖК cover */
export function complexImageOverlayLines(complex: ResidentialComplex): {
  primary: string | null;
  secondary: string | null;
} {
  let secondary: string | null = null;
  if (complex.salesStartDate?.trim()) {
    const monthYear = capitalizeRuMonthYear(complex.salesStartDate);
    const primary = monthYear ? `Старт продаж · ${monthYear}` : 'Старт продаж';
    return { primary, secondary: null };
  }
  if (complex.status === 'planned') {
    return { primary: 'Планируется', secondary: null };
  }
  return { primary: null, secondary: null };
}

/** Emphasized completion / delivery line */
/** Quarter range for marketplace cards — «3 кв. 2028 – 4 кв. 2028» without status prefix */
export function complexPopularCompletionLine(complex: ResidentialComplex): string | null {
  const quarters = complex.buildings
    .map((b) => formatCompletionQuarterText(b.deadline))
    .filter((q): q is string => Boolean(q));
  const unique = Array.from(new Set(quarters));
  if (unique.length >= 2) {
    const sorted = unique.sort((a, b) => {
      const pa = a.match(/(\d) кв\. (\d{4})/);
      const pb = b.match(/(\d) кв\. (\d{4})/);
      if (pa && pb) {
        const ya = Number(pa[2]);
        const yb = Number(pb[2]);
        if (ya !== yb) return ya - yb;
        return Number(pa[1]) - Number(pb[1]);
      }
      return a.localeCompare(b, 'ru');
    });
    return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
  }
  if (unique.length === 1) return unique[0];
  return formatCompletionQuarterText(complex.deadline ?? '');
}

export function complexCompletionLine(complex: ResidentialComplex): string | null {
  const quarter = formatCompletionQuarterText(complex.deadline ?? '');
  if (complex.status === 'completed') {
    return quarter ? `Сдан в ${quarter}` : complex.deadline === 'Сдан' ? 'Сдан' : null;
  }
  if (complex.status === 'building') {
    return quarter ? `Строится, сдача ${quarter}` : complex.deadline === 'Строится' ? 'Строится' : null;
  }
  if (complex.status === 'planned') {
    return quarter ? `Проект, сдача ${quarter}` : complex.deadline === 'Проект' ? 'Проект' : null;
  }
  return quarter;
}

export function complexMetroTimeLabel(
  distanceTime: number | null | undefined,
  distanceType?: 1 | 2 | null,
): string {
  if (distanceTime == null || distanceTime <= 0) return '';
  const mode = distanceType === 1 ? 'пешком' : 'транспортом';
  return `${distanceTime} минут ${mode}`;
}

/** Single-line metro row for ЖК cards — matches complex page wording */
export function complexMetroDisplayLine(complex: ResidentialComplex): string | null {
  const primary = complex.nearbySubways?.[0];
  const nameFromNearby = primary?.name?.trim();
  const nameFromLegacy =
    complex.subway !== '—' ? complex.subway.replace(/^м\.\s*/i, '').trim() : '';
  const name = nameFromNearby || nameFromLegacy;
  if (!name) return null;

  if (primary?.distanceTime != null && primary.distanceTime > 0) {
    const time = complexMetroTimeLabel(primary.distanceTime, primary.distanceType ?? undefined);
    return time ? `${name}, ${time}` : name;
  }

  const legacy = complex.subwayDistance?.trim();
  if (legacy && legacy !== '—') {
    const normalized = legacy.replace(/\s*мин\.?\s*$/i, '').trim();
    if (/^\d+$/.test(normalized)) {
      return `${name}, ${normalized} минут транспортом`;
    }
    return `${name}, ${legacy}`;
  }

  return name;
}

export type ComplexPriceBandRow = { rooms: number; label: string; price: string };

/** Dotted price rows from API priceRanges or loaded apartments */
export function complexPriceBandRows(complex: ResidentialComplex): ComplexPriceBandRow[] {
  const bandSortKey = (rooms: number) => {
    if (rooms === 21) return 2.5;
    return rooms;
  };
  const fromApi = (complex.priceRanges ?? [])
    .filter((r) => normalizePriceValue(r.priceMin) != null)
    .sort((a, b) => bandSortKey(a.rooms) - bandSortKey(b.rooms))
    .slice(0, 4)
    .map((r) => ({
      rooms: r.rooms,
      label: complexRoomBandLabel(r.rooms),
      price: formatPriceFromExact(r.priceMin),
    }));

  if (fromApi.length > 0) return fromApi;

  const priceBands = [...complex.buildings.flatMap((b) => b.apartments)]
    .filter((a) => a.status !== 'sold' && normalizePriceValue(a.price) != null)
    .reduce<Map<number, number>>((acc, apt) => {
      const key = apt.rooms >= 4 ? 4 : apt.rooms;
      const prev = acc.get(key);
      if (prev == null || apt.price < prev) acc.set(key, apt.price);
      return acc;
    }, new Map<number, number>());

  return Array.from(priceBands.entries())
    .sort(([a], [b]) => a - b)
    .slice(0, 4)
    .map(([rooms, price]) => ({
      rooms,
      label: complexRoomBandLabel(rooms),
      price: formatPriceFromExact(price),
    }));
}

/** «Квартир 562 · Видовых 95» */
export function complexInventoryLine(complex: ResidentialComplex): string | null {
  const total = complexTotalUnits(complex);
  if (total == null || total <= 0) return null;
  const scenic = complex.scenicCount;
  if (scenic != null && scenic > 0) {
    return `Квартир ${total} · Видовых ${scenic}`;
  }
  return `Квартир ${total}`;
}

export function complexTotalUnits(complex: ResidentialComplex): number | null {
  const fromListings = complex.listingCount;
  if (fromListings != null && fromListings > 0) return fromListings;
  const fromBuildings = complex.buildings.reduce(
    (s, b) => s + b.apartments.filter((a) => a.status !== 'sold').length,
    0,
  );
  return fromBuildings > 0 ? fromBuildings : null;
}

/** Yield label for footer — only when API provides numeric range */
export function complexYieldLabel(complex: ResidentialComplex): string | null {
  const min = complex.yieldMin;
  const max = complex.yieldMax;
  if (min != null && max != null && min > 0 && max > 0) {
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    if (Math.abs(a - b) < 0.05) return `${a.toFixed(1)}%`;
    return `${a.toFixed(1)}–${b.toFixed(1)}%`;
  }
  if (min != null && min > 0) return `${min.toFixed(1)}%`;
  if (max != null && max > 0) return `${max.toFixed(1)}%`;
  return null;
}

export function complexFallbackPriceRow(complex: ResidentialComplex): ComplexPriceBandRow | null {
  const price = formatPriceFromExact(complex.priceFrom);
  if (isPriceFallbackText(price)) return null;
  return { rooms: -1, label: 'Цены от', price };
}

/**
 * Единая «цена от» ЖК: минимум по действующим предложениям (price_ranges), иначе priceFrom.
 * Карточка каталога, подборки и страница ЖК берут цену отсюда — иначе «от 7,5» и «от 8,5» расходятся.
 */
export function complexMinPrice(complex: ResidentialComplex): number | null {
  const candidates = [
    ...(complex.priceRanges ?? []).map((r) => normalizePriceValue(r.priceMin)),
    normalizePriceValue(complex.priceFrom),
  ].filter((v): v is number => v != null && v > 0);
  return candidates.length ? Math.min(...candidates) : null;
}
