import { useState, useMemo, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { LayoutGrid, List, Map, SlidersHorizontal, X, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import RedesignHeader from '@/redesign/components/RedesignHeader';
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
import { useBodyScrollLock } from '@/redesign/hooks/useBodyScrollLock';
import SaveSearchButton from '@/account/components/SaveSearchButton';
import CatalogActiveFilterChips from '@/redesign/components/CatalogActiveFilterChips';
import CatalogFilterPresets from '@/redesign/components/CatalogFilterPresets';
import PublicTrustStrip from '@/redesign/components/PublicTrustStrip';
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
  return 'name_asc';
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
  useBodyScrollLock(showMobileFilters);

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
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const sp = buildListingsSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        kind: listingKind,
        page: pageParam,
        perPage: PER_PAGE,
      });
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
        if (next === 'name_asc') p.delete('sort');
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

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <RedesignHeader />

      <div className="border-b border-border bg-muted/30">
        <div className="max-w-[1400px] 2xl:max-w-[1760px] mx-auto px-4 py-3">
          <div className="flex items-center gap-3 max-w-[800px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Метро, район, ЖК, улица, застройщик"
                className={cn(
                  'pl-9 h-10 bg-background text-sm',
                  isSearchPending && 'border-primary/40',
                )}
                value={filters.search}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                aria-busy={isSearchPending}
              />
            </div>
            <Link
              to={mapHref}
              className="hidden sm:flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border bg-background text-sm font-medium hover:bg-secondary transition-colors shrink-0"
            >
              <MapPin className="w-4 h-4 text-primary" />
              На карте
            </Link>
          </div>
          <RegionSelector
            regions={regionRows}
            selectedRegionId={regionId}
            onSelect={handleRegionSelect}
            className="mt-3 max-w-[900px]"
          />
        </div>
      </div>

      <div className="max-w-[1400px] 2xl:max-w-[1760px] mx-auto px-4 py-3">
        <SessionResumeBanner className="mb-2" />
        <SavedSearchReminder className="mb-2" />

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold leading-tight">{pageTitle}</h1>
            <PublicTrustStrip regionId={regionId ?? undefined} catalogHeader className="mt-1" />
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading
                ? 'Загрузка…'
                : loadError
                  ? 'Ошибка загрузки'
                  : `${totalShown} загружено${totalRemote != null ? ` · всего в каталоге ${totalRemote}` : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
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
            <Button variant="outline" size="sm" className="lg:hidden h-11 sm:h-9" onClick={() => setShowMobileFilters(true)}>
              <SlidersHorizontal className="w-4 h-4 mr-1.5" /> Фильтры
            </Button>
            <Select value={catalogSort} onValueChange={handleSortChange}>
              <SelectTrigger className="h-11 sm:h-9 w-[min(200px,42vw)] sm:w-[220px] text-xs bg-background">
                <SelectValue placeholder="Сортировка" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Название, А → Я</SelectItem>
                <SelectItem value="name_desc">Название, Я → А</SelectItem>
                <SelectItem value="created_desc">Сначала новые по дате</SelectItem>
                <SelectItem value="price_asc">Цена: сначала дешевле</SelectItem>
                <SelectItem value="price_desc">Цена: сначала дороже</SelectItem>
                {showBlocks ? (
                  <SelectItem value="sales_start_asc">Старт продаж (раньше)</SelectItem>
                ) : (
                  <>
                    <SelectItem value="area_asc">Площадь: сначала меньше</SelectItem>
                    <SelectItem value="area_desc">Площадь: сначала больше</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <div className="hidden sm:flex items-center gap-0.5 border border-border rounded-xl p-1 bg-muted/50">
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
                  type="button"
                  onClick={() => handleViewChange(mode)}
                  className={cn(
                    'p-2 rounded-lg transition-all duration-200',
                    view === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <CatalogFilterPresets
          filters={filters}
          onChange={handleFiltersChange}
          showNewBuildPresets={showBlocks}
          className="mb-2"
        />

        <CatalogActiveFilterChips filters={filters} onChange={handleFiltersChange} className="mb-2" />

        {!regionId && !regionLoading && (
          <p className="text-sm text-muted-foreground mb-4">Нет регионов в базе. Добавьте регион и ЖК в админке.</p>
        )}

        {isApartmentMode && marketTabs.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Тип рынка">
            {marketTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filters.marketType === tab.value}
                onClick={() => handleFiltersChange({ ...filters, marketType: tab.value })}
                className={cn(
                  'h-11 sm:h-9 rounded-full px-4 text-sm font-medium transition-colors',
                  filters.marketType === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground hover:bg-secondary/70',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {showKindSwitcher && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Тип объекта:</span>
            {objectKindLinks.map((x) => (
              <button
                key={x.type}
                type="button"
                onClick={() => {
                  if (x.type === filters.objectType) return;
                  handleFiltersChange(resetFiltersForObjectType(filters, x.type));
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors',
                  filters.objectType === x.type
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-foreground border-border hover:bg-muted/60',
                )}
              >
                {x.label}
                <span className="opacity-70">({x.count})</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-4">
          <aside className="hidden lg:block w-[260px] shrink-0">
            <div className="sticky top-20">
              <FilterSidebar
                filters={filters}
                onChange={handleFiltersChange}
                totalCount={filtered.length}
                districtOptions={districtsQuery.data}
                subwayOptions={subwaysQuery.data}
                builderOptions={buildersQuery.data}
                deadlineOptions={deadlinesQuery.data}
                objectTypeOptions={OBJECT_TYPE_TABS.map(x => x.type)}
                showObjectTypeSwitcher={false}
                showMetro={moscowMetro}
                hasBlocks={showBlocks}
              />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {loadError && (
              <p className="text-sm text-destructive mb-4">Не удалось загрузить каталог. Проверьте API и прокси /api.</p>
            )}
            {apartmentsAsListings && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-xs text-warning">
                <span className="mt-0.5">ℹ️</span>
                <span>
                  В этом регионе пока нет жилых комплексов. Показываем отдельные квартиры от собственников и агентств.
                </span>
              </div>
            )}
            {loading && totalShown === 0 && view !== 'map' && (
              <CardGridSkeleton count={8} variant={view === 'list' ? 'list' : 'grid'} />
            )}
            {view === 'grid' && !(loading && totalShown === 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
                {showBlocks
                  ? filtered.map((c, index) => (
                      <div key={c.id} className="flex h-full min-h-0">
                        <ComplexCard
                          complex={c}
                          variant="compact"
                          coverAspect="16/9"
                          priority={index < 4}
                        />
                      </div>
                    ))
                  : listingRows.map((l) => <ListingCard key={l.id} listing={l} />)}
              </div>
            )}
            {view === 'list' && !(loading && totalShown === 0) && (
              <div className="space-y-3">
                {showBlocks
                  ? filtered.map((c) => <ComplexCard key={c.id} complex={c} variant="list" />)
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
                  <div className="h-[calc(100vh-220px)] min-h-[400px] flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
                    <span className="text-2xl">🗺️</span>
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
                    variant="outline"
                    size="sm"
                    className="min-w-[200px]"
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
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <SlidersHorizontal className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm mb-1">Ничего не найдено</p>
                <p className="text-muted-foreground text-xs mb-4">
                  Попробуйте изменить параметры фильтров, быстрые пресеты или строку поиска
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

      {showMobileFilters && (
        <div className="fixed inset-0 z-[60] bg-background overflow-y-auto animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between h-14 px-4 border-b border-border sticky top-0 bg-background z-10">
            <span className="font-semibold text-sm">Фильтры</span>
            <button type="button" onClick={() => setShowMobileFilters(false)} className="w-10 h-10 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 pb-24">
            <FilterSidebar
              filters={filters}
              onChange={handleFiltersChange}
              totalCount={filtered.length}
              districtOptions={districtsQuery.data}
              subwayOptions={subwaysQuery.data}
              builderOptions={buildersQuery.data}
              deadlineOptions={deadlinesQuery.data}
              objectTypeOptions={OBJECT_TYPE_TABS.map(x => x.type)}
              showMetro={moscowMetro}
              hasBlocks={showBlocks}
            />
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background border-t border-border">
            <Button className="w-full h-11" onClick={() => setShowMobileFilters(false)}>
              Показать {totalShown} объектов
            </Button>
          </div>
        </div>
      )}

      <CompareSessionChip />
    </div>
  );
};

export default RedesignCatalog;
