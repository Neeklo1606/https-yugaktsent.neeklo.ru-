import type { CatalogFilters, ObjectType } from '@/redesign/data/types';
import type { HousingType } from '@/redesign/lib/catalog-housing';

export type ListingKind = 'APARTMENT' | 'HOUSE' | 'LAND' | 'COMMERCIAL';

export type CatalogGeoParams = {
  geoPreset?: string;
  geoPolygon?: string;
  geoLat?: string | null;
  geoLng?: string | null;
  geoRadius?: string | null;
};

const STATUS_MAP: Record<string, string> = {
  building: 'BUILDING',
  completed: 'COMPLETED',
  planned: 'PROJECT',
};

export const LISTING_KIND_BY_OBJECT_TYPE: Record<ObjectType, ListingKind> = {
  apartments: 'APARTMENT',
  rooms: 'APARTMENT',
  houses: 'HOUSE',
  land: 'LAND',
  dachas: 'HOUSE',
  commercial: 'COMMERCIAL',
};

function setFinite(sp: URLSearchParams, key: string, value: number | undefined): void {
  if (value != null && Number.isFinite(value)) sp.set(key, String(value));
}

function setCsv(sp: URLSearchParams, key: string, values: Array<string | number>): void {
  if (values.length) sp.set(key, values.join(','));
}

function setGeo(sp: URLSearchParams, geo?: CatalogGeoParams): void {
  if (!geo) return;
  if (geo.geoPreset) sp.set('geo_preset', geo.geoPreset);
  if (geo.geoPolygon) sp.set('geo_polygon', geo.geoPolygon);
  if (geo.geoLat && geo.geoLng && geo.geoRadius) {
    sp.set('geo_lat', geo.geoLat);
    sp.set('geo_lng', geo.geoLng);
    sp.set('geo_radius_m', geo.geoRadius);
  }
}

export function hasNarrowingFilters(filters: CatalogFilters): boolean {
  return Boolean(
    filters.search.trim() ||
      filters.marketType !== 'all' ||
      filters.rooms.length ||
      filters.priceMin != null ||
      filters.priceMax != null ||
      filters.areaMin != null ||
      filters.areaMax != null ||
      filters.landAreaMin != null ||
      filters.landAreaMax != null ||
      filters.distanceMin != null ||
      filters.distanceMax != null ||
      filters.directions.length ||
      filters.houseLocation.length ||
      filters.floorMin != null ||
      filters.floorMax != null ||
      filters.deadline.length ||
      filters.landPurpose.length ||
      filters.commercialTypes.length ||
      filters.houseMaterials.length ||
      filters.status.length ||
      filters.district.length ||
      filters.subway.length ||
      filters.builder.length,
  );
}

export function buildBlocksSearchParams(args: {
  filters: CatalogFilters;
  regionId?: number | null;
  page?: number;
  perPage?: number;
  sort?: string;
  geo?: CatalogGeoParams;
  requireActiveListings?: boolean;
  /** Тип жилья ЖК (квартиры / апартаменты / коттеджи); null — все */
  housing?: HousingType | null;
}): URLSearchParams {
  const { filters, regionId, page, perPage, sort, geo, requireActiveListings, housing } = args;
  const sp = new URLSearchParams();
  if (regionId != null) sp.set('region_id', String(regionId));
  if (filters.search.trim()) sp.set('search', filters.search.trim());
  if (page != null) sp.set('page', String(page));
  if (perPage != null) sp.set('per_page', String(perPage));
  if (sort) sp.set('sort', sort);
  if (requireActiveListings) sp.set('require_active_listings', 'true');
  if (housing) sp.set('housing', housing);

  setFinite(sp, 'price_min', filters.priceMin);
  setFinite(sp, 'price_max', filters.priceMax);
  setFinite(sp, 'area_min', filters.areaMin);
  setFinite(sp, 'area_max', filters.areaMax);
  setFinite(sp, 'floor_min', filters.floorMin);
  setFinite(sp, 'floor_max', filters.floorMax);
  setCsv(sp, 'rooms', filters.rooms);
  setCsv(sp, 'deadline', filters.deadline);

  if (filters.marketType === 'new') {
    sp.set('status', 'BUILDING');
  } else if (filters.status.length === 1) {
    const status = STATUS_MAP[filters.status[0]];
    if (status) sp.set('status', status);
  }

  setCsv(sp, 'district_names', filters.district);
  setCsv(sp, 'subway_names', filters.subway);
  setCsv(sp, 'builder_names', filters.builder);
  setGeo(sp, geo);
  return sp;
}

export function buildListingsSearchParams(args: {
  filters: CatalogFilters;
  regionId?: number | null;
  kind?: ListingKind;
  page?: number;
  perPage?: number;
  geo?: CatalogGeoParams;
}): URLSearchParams {
  const { filters, regionId, kind = LISTING_KIND_BY_OBJECT_TYPE[filters.objectType], page, perPage, geo } = args;
  const sp = new URLSearchParams();
  if (regionId != null) sp.set('region_id', String(regionId));
  sp.set('kind', kind);
  sp.set('statuses', 'ACTIVE,RESERVED');
  sp.set('is_published', 'true');
  if (page != null) sp.set('page', String(page));
  if (perPage != null) sp.set('per_page', String(perPage));
  if (filters.search.trim()) sp.set('search', filters.search.trim());

  setFinite(sp, 'price_min', filters.priceMin);
  setFinite(sp, 'price_max', filters.priceMax);
  setFinite(sp, 'area_total_min', filters.areaMin);
  setFinite(sp, 'area_total_max', filters.areaMax);
  setCsv(sp, 'district_names', filters.district);
  setGeo(sp, geo);

  if (kind === 'HOUSE') {
    if (filters.objectType === 'dachas') sp.set('house_category', 'dacha');
    else if (filters.objectType === 'houses') sp.set('house_category', 'standard');
    setCsv(sp, 'rooms', filters.rooms);
    setFinite(sp, 'house_land_min', filters.landAreaMin);
    setFinite(sp, 'house_land_max', filters.landAreaMax);
    setFinite(sp, 'distance_min', filters.distanceMin);
    setFinite(sp, 'distance_max', filters.distanceMax);
    setCsv(sp, 'house_directions', filters.directions);
    setCsv(sp, 'house_location', filters.houseLocation);
    setCsv(sp, 'house_materials', filters.houseMaterials);
  }

  if (kind === 'LAND') {
    setCsv(sp, 'land_categories', filters.landPurpose);
  }

  if (kind === 'COMMERCIAL') {
    setCsv(sp, 'commercial_types', filters.commercialTypes);
  }

  if (kind === 'APARTMENT') {
    if (filters.objectType === 'rooms') sp.set('apartment_category', 'room');
    else if (filters.objectType === 'apartments') sp.set('apartment_category', 'standard');
    setCsv(sp, 'rooms', filters.rooms);
    setFinite(sp, 'floor_min', filters.floorMin);
    setFinite(sp, 'floor_max', filters.floorMax);
    if (filters.marketType === 'secondary') sp.set('apartment_market', 'secondary');
    else if (filters.marketType === 'new') sp.set('apartment_market', 'new_building');
  }

  return sp;
}
