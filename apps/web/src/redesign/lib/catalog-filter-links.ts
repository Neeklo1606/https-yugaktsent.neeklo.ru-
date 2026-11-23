import type { HousingType } from '@/redesign/lib/catalog-housing';

/** Build internal catalog URLs for SEO cross-navigation (district / metro filters). */
export function buildCatalogFilterUrl(
  regionId: number,
  opts?: { district?: string; subway?: string; objectType?: 'apartments' | 'houses' | 'land' | 'commercial'; housing?: HousingType | null },
): string {
  const params = new URLSearchParams({ region_id: String(regionId) });
  if (opts?.district?.trim()) {
    params.set('district_names', opts.district.trim());
  }
  if (opts?.subway?.trim()) {
    params.set('subway_names', opts.subway.trim());
  }
  if (opts?.housing) {
    params.set('housing', opts.housing);
  }
  const base = opts?.objectType && opts.objectType !== 'apartments' ? `/catalog/${opts.objectType}` : '/catalog';
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
