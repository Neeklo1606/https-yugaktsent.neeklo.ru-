import { describe, expect, it } from 'vitest';
import { defaultFilters, type CatalogFilters } from '@/redesign/data/types';
import {
  HOUSING_TYPES,
  housingFromSearchParams,
  housingTypeOfRow,
  parseHousingParam,
  withHousingParam,
} from '@/redesign/lib/catalog-housing';
import { catalogFiltersFromSearchParams, catalogFiltersIntoSearchParams } from '@/redesign/lib/catalog-url-sync';
import { buildBlocksSearchParams } from '@/redesign/lib/catalog-api-params';
import { buildCatalogFilterUrl } from '@/redesign/lib/catalog-filter-links';
import { buildCatalogFilterParams } from '@/redesign/lib/catalog-interaction';

const clone = (f: CatalogFilters): CatalogFilters => JSON.parse(JSON.stringify(f)) as CatalogFilters;

describe('catalog housing param', () => {
  it('parses only known values', () => {
    expect(parseHousingParam('flat')).toBe('flat');
    expect(parseHousingParam(' Aparthotel ')).toBe('aparthotel');
    expect(parseHousingParam('cottage')).toBe('cottage');
    expect(parseHousingParam('apartments')).toBeNull();
    expect(parseHousingParam('')).toBeNull();
    expect(parseHousingParam(null)).toBeNull();
  });

  it('round-trips through the URL for every type and clears on null', () => {
    for (const h of HOUSING_TYPES) {
      const sp = withHousingParam(new URLSearchParams('region_id=3'), h);
      expect(housingFromSearchParams(new URLSearchParams(sp.toString()))).toBe(h);
      expect(sp.get('region_id')).toBe('3');
    }
    const cleared = withHousingParam(new URLSearchParams('housing=cottage&sort=price_desc'), null);
    expect(cleared.has('housing')).toBe(false);
    expect(cleared.get('sort')).toBe('price_desc');
  });

  it('is independent of type/group/market and survives filter serialization', () => {
    const start = new URLSearchParams('housing=aparthotel&group=flats&market=new&type=houses');
    const filters = catalogFiltersFromSearchParams(start);
    expect(filters.objectType).toBe('houses');
    expect(filters.marketType).toBe('new');

    const next = clone(filters);
    next.priceMax = 9_000_000;
    const out = buildCatalogFilterParams(start, next, 7);
    expect(out.get('housing')).toBe('aparthotel');
    expect(out.get('group')).toBe('flats');
    expect(out.get('type')).toBe('houses');
    expect(out.get('market')).toBe('new');
    expect(out.get('price_max')).toBe('9000000');

    // type=apartments по-прежнему означает «квартиры» (вид объявления), housing не трогается
    const apt = catalogFiltersIntoSearchParams(new URLSearchParams('housing=flat'), clone(defaultFilters));
    expect(apt.get('housing')).toBe('flat');
    expect(apt.has('type')).toBe(false);
  });

  it('forwards housing to the /blocks request only when set', () => {
    const withHousing = buildBlocksSearchParams({ filters: clone(defaultFilters), regionId: 1, housing: 'cottage' });
    expect(withHousing.get('housing')).toBe('cottage');
    const without = buildBlocksSearchParams({ filters: clone(defaultFilters), regionId: 1, housing: null });
    expect(without.has('housing')).toBe(false);
  });

  it('adds housing to cross-navigation links', () => {
    expect(buildCatalogFilterUrl(2, { housing: 'aparthotel' })).toBe('/catalog?region_id=2&housing=aparthotel');
    expect(buildCatalogFilterUrl(2)).toBe('/catalog?region_id=2');
  });

  it('reads housingType defensively from API rows', () => {
    expect(housingTypeOfRow({ housingType: 'cottage' })).toBe('cottage');
    expect(housingTypeOfRow({ housingType: 'weird' })).toBeNull();
    expect(housingTypeOfRow({})).toBeNull();
    expect(housingTypeOfRow(null)).toBeNull();
  });
});
