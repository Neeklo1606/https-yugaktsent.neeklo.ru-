import { useState, useMemo, useCallback, useEffect } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, Info, LayoutGrid, List, Map, MapPin, Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import ComplexCard from '@/redesign/components/ComplexCard';
import ListingCard, { type ApiListingCardRow } from '@/redesign/components/ListingCard';
import FilterSidebar from '@/redesign/components/FilterSidebar';
import RegionSelector from '@/redesign/components/RegionSelector';
import MapSearch from '@/redesign/components/MapSearch';
import CardGridSkeleton from '@/redesign/components/CardGridSkeleton';
import ListingsMapSearch, { type ListingMapItem } from '@/redesign/components/ListingsMapSearch';
import { useDefaultRegionId, type RegionRow } from '@/redesign/hooks/useDefaultRegionId';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { mapApiBlockListRowToResidentialComplex, type ApiBlockListRow } from '@/redesign/lib/blocks-from-api';
import {
  catalogFilterUrlSignature,
  catalogFiltersFromSearchParams,
  catalogFiltersIntoSearchParams,
} from '@/redesign/lib/catalog-url-sync';
import {
  CATALOG_SEARCH_DEBOUNCE_MS,
  filterKeyPart,
  replaceCatalogFiltersInUrl,
  syncDebouncedSearchInUrl,
} from '@/redesign/lib/catalog-interaction';
import { useDebouncedValue } from '@/redesign/hooks/useDebouncedValue';
import SaveSearchButton from '@/account/components/SaveSearchButton';
import CatalogActiveFilterChips from '@/redesign/components/CatalogActiveFilterChips';
import CatalogFilterPresets from '@/redesign/components/CatalogFilterPresets';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import CatalogLandingPanel from '@/redesign/components/CatalogLandingPanel';
import SessionResumeBanner from '@/redesign/components/SessionResumeBanner';
import SavedSearchReminder from '@/redesign/components/SavedSearchReminder';
import CompareSessionChip from '@/shared/components/CompareSessionChip';
import { patchSessionSnapshot } from '@/shared/lib/session-continuity';
import { detectCatalogLanding } from '@/redesign/lib/catalog-landing';
import { buildCatalogSeoMeta } from '@/redesign/lib/catalog-seo-meta';
import { normalizeSearchQuery } from '@/redesign/lib/search-normalize';
import {
  buildBlocksSearchParams,
  buildListingsSearchParams,
  LISTING_KIND_BY_OBJECT_TYPE,
} from '@/redesign/lib/catalog-api-params';
import { defaultFilters, type CatalogFilters, type ObjectType } from '@/redesign/data/types';
import {
  isMoscowRegion,
  OBJECT_TYPE_TABS,
  resetFiltersForObjectType,
} from '@/redesign/lib/catalog-filter-config';

const OBJECT_TYPE_TITLE: Record<ObjectType, string> = {
  apartments: 'Жилые комплексы',
  rooms: 'Комнаты',
  houses: 'Дома',
  land: 'Участки',
  dachas: 'Дачи',
  commercial: 'Коммерческая недвижимость',
};

type ViewMode = 'grid' | 'list' | 'map';

const PER_PAGE = 20;

const CATALOG_SORT_VALUES = [
  'name_asc',
  'name_desc',
  'created_desc',
  'price_asc',
  'price_desc',
  'sales_start_asc',
  'area_asc',
  'area_desc',
] as const;
type CatalogSort = (typeof CATALOG_SORT_VALUES)[number];

function normalizeCitySlug(raw: string | null): string {
  return (raw ?? '').trim().toLowerCase();
}

function resolveRegionIdByCityParam(rows: RegionRow[] | undefined, cityRaw: string | null): number | null {
  if (!rows?.length) return null;
  const city = normalizeCitySlug(cityRaw);
  if (!city) return null;
  const byCode = rows.find((r) => (r.code ?? '').trim().toLowerCase() === city);
  if (byCode) return byCode.id;
  const byName = rows.find((r) => (r.name ?? '').trim().toLowerCase() === city);
  if (byName) return byName.id;
  return null;
}

function regionCenterFromRow(region?: RegionRow): [number, number] | null {
  const lat = Number(region?.mapCenterLat);
  const lng = Number(region?.mapCenterLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function fallbackCoords(center: [number, number] | null, index: number): [number, number] | null {
  if (!center) return null;
  const ring = Math.floor(index / 12) + 1;
  const angle = (index % 12) * (Math.PI / 6);
  const radius = 0.018 * ring;
  return [
    center[0] + Math.sin(angle) * radius,
    center[1] + Math.cos(angle) * radius,
  ];
}

function parseCatalogSort(raw: string | null): CatalogSort {
  if (raw && (CATALOG_SORT_VALUES as readonly string[]).includes(raw)) {
    return raw as CatalogSort;
  }
  return DEFAULT_CATALOG_SORT;
}

/** Сортировка по умолчанию: покупателю важнее цена, чем алфавит (ТЗ v3, 4.3) */
const DEFAULT_CATALOG_SORT: CatalogSort = 'price_asc';

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const RedesignCatalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<ViewMode>('grid');
  // Стартуем сразу с фильтрами из адреса: иначе на первом рендере черновик поиска
  // пуст, синхронизация считает его «устоявшимся» и вычищает search из URL.
  const [filters, setFilters] = useState<CatalogFilters>(() =>
    catalogFiltersFromSearchParams(new URLSearchParams(window.location.search)),
  );
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mapActive, setMapActive] = useState<string | null>(null);
  const [mapActiveListing, setMapActiveListing] = useState<number | null>(null);
  const { data: defaultRegionId, rows: regionRows, setStoredRegionId } = useDefaultRegionId();
  const { shortName } = useSiteBrand();
  const urlRegionIdRaw = searchParams.get('region_id');
  const urlRegionId = urlRegionIdRaw ? parseInt(urlRegionIdRaw, 10) : NaN;
  const cityParam = searchParams.get('city');
  const cityRegionId = useMemo(
    () => resolveRegionIdByCityParam(regionRows, cityParam),
    [regionRows, cityParam],
  );
  const regionId =
    Number.isFinite(urlRegionId) && urlRegionId > 0
      ? urlRegionId
      : (cityRegionId ?? defaultRegionId);
  const regionCenter = useMemo(
    () => regionCenterFromRow(regionRows?.find((r) => r.id === regionId)),
    [regionId, regionRows],
  );

  useEffect(() => {
    if (Number.isFinite(urlRegionId) && urlRegionId > 0) {
      if (defaultRegionId !== urlRegionId) {
        setStoredRegionId(urlRegionId);
      }
      return;
    }
    if (cityRegionId != null && cityRegionId !== defaultRegionId) {
      setStoredRegionId(cityRegionId);
    }
  }, [urlRegionId, cityRegionId, defaultRegionId, setStoredRegionId]);

  const geoPreset = searchParams.get('geo_preset') ?? undefined;
  const geoPolygon = searchParams.get('geo_polygon') ?? undefined;
  const geoLat = searchParams.get('geo_lat');
  const geoLng = searchParams.get('geo_lng');
  const geoRadius = searchParams.get('geo_radius_m');

  const catalogUrlSig = useMemo(
    () => catalogFilterUrlSignature(new URLSearchParams(searchParams)),
    [searchParams.toString()],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setFilters(catalogFiltersFromSearchParams(sp));
  }, [catalogUrlSig]);

  const urlView = searchParams.get('view');
  useEffect(() => {
    if (urlView === 'grid' || urlView === 'list' || urlView === 'map') {
      setView(urlView);
    }
  }, [urlView]);

  const handleViewChange = useCallback(
    (mode: ViewMode) => {
      setView(mode);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (mode === 'grid') p.delete('view');
          else p.set('view', mode);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const debouncedSearch = useDebouncedValue(filters.search, CATALOG_SEARCH_DEBOUNCE_MS);
  const isSearchPending = filters.search !== debouncedSearch;

  useEffect(() => {
    syncDebouncedSearchInUrl(setSearchParams, filters.search, debouncedSearch);
  }, [debouncedSearch, filters.search, setSearchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = window.location.search;
    if (qs) {
      patchSessionSnapshot({ catalogHref: `/catalog${qs}` });
    }
  }, [searchParams]);

  const regionLoading = regionId == null;
  const catalogSort = parseCatalogSort(searchParams.get('sort'));

  const isApartmentMode = filters.objectType === 'apartments';
  const useBlocksCatalog = isApartmentMode && filters.marketType !== 'secondary';
  const listingKind = LISTING_KIND_BY_OBJECT_TYPE[filters.objectType];
  const regionName = useMemo(
    () => regionRows?.find((row) => row.id === regionId)?.name ?? null,
    [regionId, regionRows],
  );
  const catalogLanding = useMemo(
    () => detectCatalogLanding(filters, { sort: catalogSort }),
    [filters, catalogSort],
  );
  const catalogSeo = useMemo(
    () => buildCatalogSeoMeta(debouncedSearch, filters, { sort: catalogSort, regionName, siteName: shortName }),
    [debouncedSearch, filters, catalogSort, regionName, shortName],
  );
  const pageTitle =
    catalogLanding.kind === 'district' || catalogLanding.kind === 'subway'
      ? catalogSeo.title.replace(regionName ? `${regionName} · ` : '', '')
      : OBJECT_TYPE_TITLE[filters.objectType] ?? OBJECT_TYPE_TITLE.apartments;

  const listingsInfinite = useInfiniteQuery({
    queryKey: [
      'listings',
      'catalog',
      'infinite',
      regionId,
      listingKind,
      filters.objectType,
      debouncedSearch,
      filters.priceMin,
      filters.priceMax,
      filterKeyPart(filters.rooms),
      filters.areaMin,
      filters.areaMax,
      filters.landAreaMin,
      filters.landAreaMax,
      filters.distanceMin,
      filters.distanceMax,
      filterKeyPart(filters.directions),
      filterKeyPart(filters.houseLocation),
      filters.floorMin,
      filters.floorMax,
      filterKeyPart(filters.landPurpose),
      filterKeyPart(filters.commercialTypes),
      filterKeyPart(filters.houseMaterials),
      filterKeyPart(filters.district),
      filters.marketType,
      catalogSort,
    ],
    initialPageParam: 1,
    // Пока грузится новая выдача, показываем прежнюю, а не скелетон на весь экран
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const sp = buildListingsSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        kind: listingKind,
        page: pageParam,
        perPage: PER_PAGE,
      });
      // API объявлений умеет price/area/floor/created — раньше сортировка сюда не доходила
      if (catalogSort !== 'name_asc' && catalogSort !== 'name_desc' && catalogSort !== 'sales_start_asc') sp.set('sort', catalogSort);
      return apiGet<{
        data: ApiListingCardRow[];
        meta: { page: number; per_page: number; total: number; total_pages: number };
      }>(`/listings?${sp}`);
    },
    getNextPageParam: (lastPage) => {
      const { page, total_pages: totalPages } = lastPage.meta;
      if (page >= totalPages) return undefined;
      return page + 1;
    },
    enabled: regionId != null,
  });

  // Flat (non-paginated) query for map view showing individual listings
  const listingsMapQuery = useQuery({
    queryKey: ['listings', 'catalog', 'map', regionId, listingKind, filters.objectType, debouncedSearch, filters.priceMin, filters.priceMax, filterKeyPart(filters.rooms), filters.areaMin, filters.areaMax, filters.landAreaMin, filters.landAreaMax, filters.distanceMin, filters.distanceMax, filterKeyPart(filters.directions), filterKeyPart(filters.houseLocation), filters.floorMin, filters.floorMax, filterKeyPart(filters.landPurpose), filterKeyPart(filters.commercialTypes), filterKeyPart(filters.houseMaterials), filterKeyPart(filters.district), filters.marketType],
    queryFn: async () => {
      const sp = buildListingsSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        kind: listingKind,
        page: 1,
        perPage: 200,
      });
      return apiGet<{ data: ApiListingCardRow[] }>(`/listings?${sp}`);
    },
    enabled: regionId != null && view === 'map',
    staleTime: 2 * 60 * 1000,
  });

  const blocksInfinite = useInfiniteQuery({
    queryKey: [
      'blocks',
      'catalog',
      'infinite',
      regionId,
      debouncedSearch,
      catalogSort,
      filters.priceMin,
      filters.priceMax,
      filters.areaMin,
      filters.areaMax,
      filters.floorMin,
      filters.floorMax,
      filterKeyPart(filters.deadline),
      filterKeyPart(filters.status),
      filters.objectType,
      filters.marketType,
      filterKeyPart(filters.district),
      filterKeyPart(filters.subway),
      filterKeyPart(filters.builder),
      filterKeyPart(filters.rooms),
      filterKeyPart(filters.landPurpose),
      filterKeyPart(filters.commercialTypes),
      filterKeyPart(filters.houseMaterials),
      geoPreset, geoPolygon, geoLat, geoLng, geoRadius,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const sp = buildBlocksSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        page: pageParam,
        perPage: PER_PAGE,
        sort: catalogSort,
        geo: { geoPreset, geoPolygon, geoLat, geoLng, geoRadius },
      });
      return apiGet<{
        data: ApiBlockListRow[];
        meta: { page: number; per_page: number; total: number; total_pages: number };
      }>(`/blocks?${sp}`);
    },
    getNextPageParam: (lastPage) => {
      const { page, total_pages: totalPages } = lastPage.meta;
      if (page >= totalPages) return undefined;
      return page + 1;
    },
    enabled: useBlocksCatalog && regionId != null,
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  });

  // Pass listing kind to districts query so only relevant districts are shown
  const districtKind = listingKind ?? 'APARTMENT';
  const districtsQuery = useQuery({
    queryKey: ['districts', regionId, districtKind],
    queryFn: () => apiGet<{ name: string }[]>(`/districts?region_id=${regionId}&kind=${districtKind}`),
    enabled: regionId != null,
    select: (r) => r.map((x) => x.name),
  });

  const kindCountsQuery = useQuery({
    queryKey: ['stats', 'listing-kind-counts', regionId],
    queryFn: () => apiGet<Record<string, number>>(`/stats/listing-kind-counts?region_id=${regionId}`),
    enabled: regionId != null,
    staleTime: 60_000,
  });

  const kindCounts = kindCountsQuery.data ?? {};
  const objectKindLinks = useMemo(() => {
    const withCounts = OBJECT_TYPE_TABS.map((x) => ({ ...x, count: kindCounts[x.countKey] ?? 0 }));
    // Счётчики ещё не пришли или API молчит — показываем все типы, чтобы не запереть пользователя
    if (withCounts.every((x) => x.count === 0)) return withCounts;
    return withCounts.filter((x) => x.count > 0 || x.type === filters.objectType);
  }, [kindCounts, filters.objectType]);
  const showKindSwitcher = objectKindLinks.length > 1;
  /** Таб «Вторичка» показываем только там, где она есть в данных. */
  const secondaryCountQuery = useQuery({
    queryKey: ['listings', 'secondary-availability', regionId],
    queryFn: async () => {
      const sp = buildListingsSearchParams({
        filters: { ...defaultFilters, objectType: 'apartments', marketType: 'secondary' },
        regionId,
        kind: 'APARTMENT',
        page: 1,
        perPage: 1,
      });
      const res = await apiGet<{ meta?: { total?: number } }>(`/listings?${sp}`);
      return res.meta?.total ?? 0;
    },
    enabled: regionId != null && isApartmentMode,
    staleTime: 5 * 60 * 1000,
  });
  const hasSecondary = (secondaryCountQuery.data ?? 0) > 0;

  const marketTabs = useMemo(
    () =>
      [
        { value: 'all' as const, label: 'Все' },
        { value: 'new' as const, label: 'Новостройки' },
        ...(hasSecondary || filters.marketType === 'secondary'
          ? [{ value: 'secondary' as const, label: 'Вторичка' }]
          : []),
      ],
    [hasSecondary, filters.marketType],
  );

  const moscowMetro = useMemo(
    () => isMoscowRegion(regionRows, regionId),
    [regionId, regionRows],
  );

  const subwaysQuery = useQuery({
    queryKey: ['subways', regionId],
    queryFn: () => apiGet<{ name: string }[]>(`/subways?region_id=${regionId}`),
    enabled: regionId != null,
    select: (r) => r.map((x) => x.name),
  });

  const buildersQuery = useQuery({
    queryKey: ['builders', regionId],
    queryFn: () => apiGet<{ name: string }[]>(`/builders?region_id=${regionId}`),
    enabled: regionId != null,
    select: (r) => r.map((x) => x.name),
  });

  const deadlinesQuery = useQuery({
    queryKey: ['blocks', 'deadlines', regionId],
    queryFn: () => apiGet<string[]>(`/blocks/deadlines?region_id=${regionId ?? 1}`),
    enabled: Boolean(regionId),
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(
    () =>
      blocksInfinite.data?.pages.flatMap((p) => p.data).map(mapApiBlockListRowToResidentialComplex) ?? [],
    [blocksInfinite.data],
  );

  const listingRows = useMemo<ApiListingCardRow[]>(
    () => listingsInfinite.data?.pages.flatMap((p) => p.data) ?? [],
    [listingsInfinite.data],
  );

  const filtered = rows;

  const handleFiltersChange = useCallback(
    (f: CatalogFilters) => {
      const next = { ...f, search: normalizeSearchQuery(f.search) };
      setFilters(next);
      replaceCatalogFiltersInUrl(setSearchParams, next, regionId);
    },
    [setSearchParams, regionId],
  );

  const handleSearchInputChange = useCallback((search: string) => {
    setFilters((prev) => ({ ...prev, search }));
  }, []);

  const handleResetFilters = useCallback(() => {
    handleFiltersChange({ ...defaultFilters, objectType: filters.objectType });
  }, [handleFiltersChange, filters.objectType]);

  const handleRegionSelect = useCallback(
    (nextRegionId: number) => {
      setStoredRegionId(nextRegionId);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('region_id', String(nextRegionId));
        p.delete('city');
        return p;
      }, { replace: true });
    },
    [setSearchParams, setStoredRegionId],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      const next = parseCatalogSort(value);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next === DEFAULT_CATALOG_SORT) p.delete('sort');
        else p.set('sort', next);
        return p;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const blocksTotal = blocksInfinite.data?.pages[0]?.meta.total ?? 0;
  const listingsTotal = listingsInfinite.data?.pages[0]?.meta.total ?? 0;
  // Если выбран режим «Квартиры», но в регионе нет ЖК — показываем standalone APARTMENT-объявления.
  const apartmentsAsListings = isApartmentMode && (!useBlocksCatalog || (blocksInfinite.isFetched && blocksTotal === 0 && listingsTotal > 0));
  const showBlocks = useBlocksCatalog && !apartmentsAsListings;

  const totalRemote = showBlocks ? blocksTotal : listingsTotal;

  function getListingCardPhoto(l: ApiListingCardRow): string | null {
    const extras = l.apartment?.extraPhotoUrls;
    if (Array.isArray(extras) && extras.length) return extras[0] as string;
    if (l.house?.photoUrl) return l.house.photoUrl;
    const hExtras = l.house?.extraPhotoUrls;
    if (Array.isArray(hExtras) && hExtras.length) return hExtras[0] as string;
    if (l.land?.photoUrl) return l.land.photoUrl;
    if (l.commercial) return null;
    return null;
  }
  const loading = regionLoading
    || (showBlocks && blocksInfinite.isPending && !blocksInfinite.data)
    || (!showBlocks && listingsInfinite.isPending && !listingsInfinite.data);
  const loadError = showBlocks ? blocksInfinite.isError : listingsInfinite.isError;
  const hasMore = showBlocks ? Boolean(blocksInfinite.hasNextPage) : Boolean(listingsInfinite.hasNextPage);
  const fetchingMore = showBlocks ? blocksInfinite.isFetchingNextPage : listingsInfinite.isFetchingNextPage;
  const totalShown = showBlocks ? filtered.length : listingRows.length;
  const fetchNext = () => {
    if (showBlocks) void blocksInfinite.fetchNextPage();
    else void listingsInfinite.fetchNextPage();
  };

  const mapHref = useMemo(() => {
    const params = catalogFiltersIntoSearchParams(new URLSearchParams(), filters);
    if (regionId != null) params.set('region_id', String(regionId));
    return `/map${params.toString() ? `?${params.toString()}` : ''}`;
  }, [filters, regionId]);

  const refreshing = showBlocks ? blocksInfinite.isPlaceholderData : listingsInfinite.isPlaceholderData;
  const unitWord = showBlocks
    ? pluralRu(totalRemote ?? 0, 'жилой комплекс', 'жилых комплекса', 'жилых комплексов')
    : pluralRu(totalRemote ?? 0, 'объект', 'объекта', 'объектов');
  const foundLine = loading
    ? 'Ищем…'
    : loadError
      ? null
      : totalRemote != null
        ? `Найдено ${totalRemote.toLocaleString('ru-RU')} ${unitWord}`
        : null;
  const activeFilterCount = [
    filters.priceMin != null || filters.priceMax != null,
    filters.rooms.length > 0,
    filters.areaMin != null || filters.areaMax != null,
    filters.floorMin != null || filters.floorMax != null,
    filters.deadline.length > 0,
    filters.status.length > 0,
    filters.builder.length > 0,
    filters.district.length > 0,
  ].filter(Boolean).length;
  const heading = regionName && isApartmentMode ? `${pageTitle} в ${regionName === 'Анапа' ? 'Анапе' : regionName}` : pageTitle;

  const sidebarProps = {
    filters,
    onChange: handleFiltersChange,
    totalCount: filtered.length,
    districtOptions: districtsQuery.data,
    subwayOptions: subwaysQuery.data,
    builderOptions: buildersQuery.data,
    deadlineOptions: deadlinesQuery.data,
    objectTypeOptions: OBJECT_TYPE_TABS.map((x) => x.type),
    showMetro: moscowMetro,
    hasBlocks: showBlocks,
  };

  return (
    <div className="min-h-screen bg-background pb-mobile-nav">
      <RedesignHeader />

      <div className="border-b border-border bg-card">
        <div className="container-page py-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:max-w-[640px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="Поиск по каталогу"
                placeholder="ЖК, улица или застройщик"
                className={cn('h-11 pl-10', isSearchPending && 'border-focus')}
                value={filters.search}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                aria-busy={isSearchPending}
              />
            </div>
            <Link to={mapHref} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[14px] font-medium hover:bg-surface-soft sm:px-4">
              <MapPin className="h-4 w-4 text-primary" aria-hidden />
              <span className="hidden sm:inline">На карте</span>
              <span className="sr-only sm:hidden">На карте</span>
            </Link>
          </div>
          {(regionRows?.length ?? 0) > 1 ? (
            <RegionSelector regions={regionRows} selectedRegionId={regionId} onSelect={handleRegionSelect} className="mt-3 max-w-[900px]" />
          ) : null}
        </div>
      </div>

      <div className="container-page py-4 lg:py-6">
        <SessionResumeBanner className="mb-2" />
        <SavedSearchReminder className="mb-2" />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight lg:text-[32px]">{heading}</h1>
            {foundLine ? <p className="mt-1 text-[14px] text-muted-foreground tabular-nums" aria-live="polite">{foundLine}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <SaveSearchButton
              filters={filters}
              regionId={regionId}
              geo={{
                geo_lat: geoLat ? Number(geoLat) : undefined,
                geo_lng: geoLng ? Number(geoLng) : undefined,
                geo_radius_m: geoRadius ? Number(geoRadius) : undefined,
                geo_polygon: geoPolygon ?? undefined,
                geo_preset: geoPreset ?? undefined,
              }}
            />
            <button
              type="button"
              onClick={() => setShowMobileFilters(true)}
              className="relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-[14px] font-medium hover:bg-surface-soft lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Фильтры
              {activeFilterCount ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">{activeFilterCount}</span>
              ) : null}
            </button>
            <Select value={catalogSort} onValueChange={handleSortChange}>
              <SelectTrigger aria-label="Сортировка" className="h-11 min-w-0 flex-1 text-[14px] sm:w-[230px] sm:flex-none">
                <SelectValue placeholder="Сортировка" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_asc">Сначала дешевле</SelectItem>
                <SelectItem value="price_desc">Сначала дороже</SelectItem>
                {showBlocks ? null : (
                  <>
                    <SelectItem value="area_asc">Площадь: меньше</SelectItem>
                    <SelectItem value="area_desc">Площадь: больше</SelectItem>
                  </>
                )}
                <SelectItem value="created_desc">Сначала новые</SelectItem>
                {showBlocks ? <SelectItem value="sales_start_asc">Старт продаж</SelectItem> : null}
                <SelectItem value="name_asc">По названию</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden items-center gap-0.5 rounded-lg border border-border bg-card p-1 sm:flex" role="group" aria-label="Вид">
              {(
                [
                  ['grid', LayoutGrid, 'Плитка'],
                  ['list', List, 'Список'],
                  ['map', Map, 'Карта'],
                ] as const
              ).map(([mode, Icon, title]) => (
                <button
                  key={mode}
                  title={title}
                  aria-label={title}
                  aria-pressed={view === mode}
                  type="button"
                  onClick={() => handleViewChange(mode)}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-md transition-colors', view === mode ? 'bg-surface-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* «Все / Новостройки» без вторички — выбор без выбора: вкладки только когда вторичка есть */}
        {isApartmentMode && (hasSecondary || filters.marketType === 'secondary') && (
          <div className="mb-3 inline-flex rounded-lg bg-surface-soft p-1" role="tablist" aria-label="Рынок">
            {marketTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filters.marketType === tab.value}
                onClick={() => handleFiltersChange({ ...filters, marketType: tab.value })}
                className={cn(
                  'h-9 rounded-md px-4 text-[14px] font-medium transition-colors',
                  filters.marketType === tab.value ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {showKindSwitcher && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Тип объекта">
            {objectKindLinks.map((x) => (
              <button
                key={x.type}
                type="button"
                aria-pressed={filters.objectType === x.type}
                onClick={() => {
                  if (x.type === filters.objectType) return;
                  handleFiltersChange(resetFiltersForObjectType(filters, x.type));
                }}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] transition-colors',
                  filters.objectType === x.type ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40',
                )}
              >
                {x.label}
                <span className="tabular-nums opacity-70">{x.count.toLocaleString('ru-RU')}</span>
              </button>
            ))}
          </div>
        )}

        <CatalogFilterPresets filters={filters} onChange={handleFiltersChange} showNewBuildPresets={showBlocks} className="mb-2" />
        <CatalogActiveFilterChips filters={filters} onChange={handleFiltersChange} className="mb-3" />

        {!regionId && !regionLoading && <p className="mb-4 text-sm text-muted-foreground">Каталог временно недоступен.</p>}

        <div className="flex gap-6">
          <aside className="hidden w-[272px] shrink-0 lg:block" aria-label="Фильтры">
            <div className="sticky top-24 rounded-card border border-border bg-card px-4 py-2">
              <FilterSidebar {...sidebarProps} showObjectTypeSwitcher={false} />
            </div>
          </aside>

          <div className={cn('min-w-0 flex-1 transition-opacity', refreshing && 'opacity-60')} aria-busy={refreshing || loading}>
            {loadError && (
              <div className="mb-4 flex flex-col items-start gap-3 rounded-card border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <p className="flex-1 text-[14px] text-foreground">Не удалось загрузить каталог. Проверьте соединение и попробуйте ещё раз.</p>
                <Button variant="secondary" size="sm" onClick={() => void (showBlocks ? blocksInfinite.refetch() : listingsInfinite.refetch())}>
                  Повторить
                </Button>
              </div>
            )}
            {apartmentsAsListings && (
              <div className="mb-4 flex items-start gap-2 rounded-card border border-border bg-surface-soft px-4 py-3 text-[14px] text-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Жилых комплексов здесь пока нет — показываем отдельные квартиры.</span>
              </div>
            )}
            {loading && totalShown === 0 && view !== 'map' && <CardGridSkeleton count={6} variant={view === 'list' ? 'list' : 'grid'} />}
            {view === 'grid' && !(loading && totalShown === 0) && (
              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {showBlocks
                  ? filtered.map((c, index) => <ComplexCard key={c.id} complex={c} priority={index < 2} cityFallback={regionName ?? undefined} />)
                  : listingRows.map((l) => <ListingCard key={l.id} listing={l} />)}
              </div>
            )}
            {view === 'list' && !(loading && totalShown === 0) && (
              <div className="space-y-3">
                {showBlocks
                  ? filtered.map((c) => <ComplexCard key={c.id} complex={c} variant="list" cityFallback={regionName ?? undefined} />)
                  : listingRows.map((l) => <ListingCard key={l.id} listing={l} variant="list" />)}
              </div>
            )}
            {view === 'map' && showBlocks && (
              <div className="h-[calc(100vh-220px)] min-h-[400px]">
                <MapSearch
                  complexes={filtered}
                  regionId={regionId}
                  regionCenter={regionCenter}
                  activeSlug={mapActive}
                  onSelect={setMapActive}
                  compact
                />
              </div>
            )}
            {view === 'map' && !showBlocks && (() => {
              const mapData = listingsMapQuery.data?.data ?? listingRows;
              const useApproximateCoords = filters.objectType === 'apartments' && filters.marketType === 'secondary';
              const mapItems: ListingMapItem[] = mapData
                .map((l, index) => {
                  const fallback = useApproximateCoords ? fallbackCoords(regionCenter, index) : null;
                  const lat = l.lat ?? fallback?.[0] ?? null;
                  const lng = l.lng ?? fallback?.[1] ?? null;
                  if (lat == null || lng == null) return null;
                  return {
                    id: l.id,
                    lat,
                    lng,
                    price: l.price,
                    title: l.title ?? null,
                    kind: l.kind,
                    address: l.address ?? null,
                    photoUrl: getListingCardPhoto(l),
                  };
                })
                .filter((l): l is ListingMapItem => l != null);
              if (mapItems.length === 0) {
                return (
                  <div className="h-[calc(100vh-220px)] min-h-[400px] flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground border border-dashed border-border rounded-card p-6 text-center">
                    <MapPin className="h-6 w-6 text-muted-foreground" aria-hidden />
                    <p className="font-medium text-foreground">Нет объектов с координатами для отображения на карте</p>
                    <button onClick={() => handleViewChange('grid')} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                      Показать плиткой
                    </button>
                  </div>
                );
              }
              return (
                <div className="h-[calc(100vh-220px)] min-h-[400px]">
                  <ListingsMapSearch
                    listings={mapItems}
                    regionId={regionId}
                    regionCenter={regionCenter}
                    activeId={mapActiveListing}
                    onSelect={setMapActiveListing}
                    compact
                  />
                </div>
              );
            })()}
            {view !== 'map' && totalShown > 0 && (
              <div className="flex flex-col items-center gap-2 mt-8">
                {hasMore ? (
                  <Button
                    variant="secondary"
                    className="min-w-[220px]"
                    disabled={fetchingMore}
                    onClick={fetchNext}
                  >
                    {fetchingMore ? 'Загрузка…' : 'Показать ещё'}
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Показано {totalShown}
                  {totalRemote != null ? ` из ${totalRemote}` : ''}
                </p>
              </div>
            )}
            {!loading && totalShown === 0 && view !== 'map' && (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-full bg-surface-soft flex items-center justify-center mx-auto mb-3">
                  <SearchX className="w-6 h-6 text-muted-foreground" aria-hidden />
                </div>
                <p className="text-foreground text-[17px] font-semibold mb-1">Ничего не нашлось</p>
                <p className="text-muted-foreground text-[14px] mb-4">
                  Попробуйте расширить цену или убрать часть фильтров
                </p>
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  Сбросить фильтры
                </Button>
                {objectKindLinks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 justify-center">
                    {objectKindLinks
                      .filter((x) => x.type !== filters.objectType)
                      .map((x) => (
                        <button
                          key={x.type}
                          type="button"
                          onClick={() => handleFiltersChange({
                            ...defaultFilters,
                            objectType: x.type,
                            search: filters.search,
                            priceMin: filters.priceMin,
                            priceMax: filters.priceMax,
                          })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-primary text-primary hover:bg-primary/10"
                        >
                          Открыть «{x.label}» ({x.count})
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            <CatalogLandingPanel
              regionId={regionId}
              regionName={regionName}
              landing={catalogLanding}
            />
          </div>
        </div>
      </div>

      <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
        <SheetContent side="bottom" className="flex max-h-[92svh] flex-col rounded-t-sheet p-0">
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <SheetHeader className="shrink-0 px-4 pb-1 pt-2 text-left">
            <SheetTitle>Фильтры</SheetTitle>
            <SheetDescription className="sr-only">Параметры поиска по каталогу</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {/* Типы и рынок выбираются над выдачей — там только те, где есть объекты */}
            <FilterSidebar {...sidebarProps} showObjectTypeSwitcher={false} />
          </div>
          <div className="flex shrink-0 gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="secondary" onClick={handleResetFilters}>
              Сбросить
            </Button>
            <Button className="flex-1" onClick={() => setShowMobileFilters(false)}>
              {loading || refreshing || totalRemote == null ? 'Показать объекты' : `Показать ${totalRemote.toLocaleString('ru-RU')}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <CompareSessionChip />
      <FooterSection />
    </div>
  );
};

export default RedesignCatalog;
