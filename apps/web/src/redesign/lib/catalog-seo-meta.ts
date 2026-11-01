import type { CatalogFilters } from '@/redesign/data/types';
import { detectCatalogLanding } from '@/redesign/lib/catalog-landing';

export type CatalogSeoMeta = {
  title: string;
  description: string;
  noindex?: boolean;
};

const ROOM_LABELS: Record<number, string> = {
  0: 'студии',
  1: '1-комнатные',
  2: '2-комнатные',
  3: '3-комнатные',
  4: '4+ комнатные',
};

function countActiveFilters(f: CatalogFilters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.rooms.length) n++;
  if (f.priceMin != null || f.priceMax != null) n++;
  if (f.areaMin != null || f.areaMax != null) n++;
  if (f.district.length) n++;
  if (f.subway.length) n++;
  if (f.builder.length) n++;
  if (f.landPurpose.length || f.commercialTypes.length || f.houseMaterials.length) n++;
  if (f.status.length) n++;
  return n;
}

/** SEO titles for /catalog with URL filter state (client-side). */
/**
 * «в Анапе», «в Краснодаре», «в Тюмени». Название из нескольких слов
 * склонять не беремся — тогда « — Краснодарский край».
 */
export function inRegionPhrase(name: string): string {
  if (/\s/.test(name)) return ` — ${name}`;
  if (/[ая]$/i.test(name)) return ` в ${name.slice(0, -1)}е`;
  if (/ь$/i.test(name)) return ` в ${name.slice(0, -1)}и`;
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(name)) return ` в ${name}е`;
  return ` в ${name}`;
}

export function buildCatalogSeoMeta(
  search: string,
  filters: CatalogFilters,
  opts?: { page?: number; sort?: string | null; regionName?: string | null; siteName?: string | null },
): CatalogSeoMeta {
  const siteName = opts?.siteName?.trim() || 'Агентство недвижимости';
  const landing = detectCatalogLanding(filters, opts);
  const regionPrefix = opts?.regionName?.trim() ? `${opts.regionName.trim()} · ` : '';
  const parts: string[] = [];

  if (filters.objectType === 'houses') parts.push('дома');
  else if (filters.objectType === 'land') parts.push('участки');
  else if (filters.objectType === 'commercial') parts.push('коммерция');
  else if (filters.marketType === 'secondary') parts.push('вторичка');
  else if (filters.marketType === 'new') parts.push('новостройки');
  else parts.push('каталог');

  if (filters.rooms.length === 1) {
    parts.push(ROOM_LABELS[filters.rooms[0]] ?? `${filters.rooms[0]}-комн.`);
  } else if (filters.rooms.length > 1) {
    parts.push(filters.rooms.map((r) => ROOM_LABELS[r] ?? `${r}-комн.`).join(', '));
  }

  if (filters.district.length === 1) {
    parts.push(`район ${filters.district[0]}`);
  } else if (filters.district.length > 1) {
    parts.push(filters.district.join(', '));
  }

  if (filters.subway.length === 1) {
    parts.push(`м. ${filters.subway[0]}`);
  } else if (filters.subway.length > 1) {
    parts.push(filters.subway.map((s) => `м. ${s}`).join(', '));
  }

  if (filters.priceMax != null) {
    parts.push(`до ${Math.round(filters.priceMax / 1_000_000)} млн ₽`);
  }
  if (filters.priceMin != null) {
    parts.push(`от ${Math.round(filters.priceMin / 1_000_000)} млн ₽`);
  }
  if (filters.search.trim()) {
    parts.push(`«${filters.search.trim().slice(0, 40)}»`);
  }

  const activeCount = countActiveFilters(filters);
  const page = opts?.page ?? 1;
  const hasSort = Boolean(opts?.sort && opts.sort !== 'name_asc');

  let titleBase: string;
  if (landing.kind === 'district' && landing.district) {
    titleBase = `Квартиры в районе ${landing.district}`;
  } else if (landing.kind === 'subway' && landing.subway) {
    titleBase = `Недвижимость у метро ${landing.subway}`;
  } else if (landing.kind === 'rooms' && filters.rooms.length === 1) {
    titleBase = `${ROOM_LABELS[filters.rooms[0]] ?? 'Квартиры'}, каталог`;
  } else {
    titleBase =
      parts.length > 1
        ? `Каталог: ${parts.slice(0, 5).join(' · ')}`
        : parts[0] === 'новостройки'
          ? 'Каталог новостроек и квартир'
          : parts[0] === 'каталог'
            ? 'Каталог недвижимости'
            : `Каталог · ${parts[0]}`;
  }

  const title = regionPrefix ? `${regionPrefix}${titleBase}` : titleBase;

  const regionHint = opts?.regionName?.trim() ? inRegionPhrase(opts.regionName.trim()) : '';
  let description: string;
  if (landing.kind === 'district' && landing.district) {
    description = `Квартиры и новостройки в районе ${landing.district}${regionHint}. Фильтры, карта, актуальные объекты на ${siteName}.`;
  } else if (landing.kind === 'subway' && landing.subway) {
    description = `Недвижимость у метро ${landing.subway}${regionHint}: ЖК и квартиры с фильтрами и картой на ${siteName}.`;
  } else {
    description =
      activeCount > 0
        ? `Подбор недвижимости${regionHint} на ${siteName}: ${parts.join(', ')}. Фильтры, карта, актуальные объекты.`
        : `Подбор ЖК и квартир${regionHint} по цене, району, сроку сдачи и другим параметрам. Карта, избранное, подборки.`;
  }

  const noindex =
    Boolean(filters.search.trim()) ||
    activeCount >= 4 ||
    page > 1 ||
    hasSort ||
    filters.district.length > 1 ||
    filters.subway.length > 1;

  return { title, description, noindex };
}
