import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import MapSearch from '@/redesign/components/MapSearch';
import ListingsMapSearch, { type ListingMapItem } from '@/redesign/components/ListingsMapSearch';
import FilterSidebar from '@/redesign/components/FilterSidebar';
import RegionSelector from '@/redesign/components/RegionSelector';
import { apiGet } from '@/lib/api';
import { type CatalogFilters, type ObjectType } from '@/redesign/data/types';
import { isMoscowRegion, OBJECT_TYPE_TABS } from '@/redesign/lib/catalog-filter-config';
import { Search, SlidersHorizontal, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDefaultRegionId, type RegionRow } from '@/redesign/hooks/useDefaultRegionId';
import { mapApiBlockListRowToResidentialComplex, type ApiBlockListRow } from '@/redesign/lib/blocks-from-api';
import {
  catalogFilterUrlSignature,
  catalogFiltersFromSearchParams,
} from '@/redesign/lib/catalog-url-sync';
import {
  CATALOG_SEARCH_DEBOUNCE_MS,
  filterKeyPart,
  replaceCatalogFiltersInUrl,
  syncDebouncedSearchInUrl,
} from '@/redesign/lib/catalog-interaction';
import { useDebouncedValue } from '@/redesign/hooks/useDebouncedValue';
import { useBodyScrollLock } from '@/redesign/hooks/useBodyScrollLock';
import { initMapSessionDiagnostics } from '@/redesign/lib/map-session-diagnostics';
import {
  buildBlocksSearchParams,
  buildListingsSearchParams,
  LISTING_KIND_BY_OBJECT_TYPE,
} from '@/redesign/lib/catalog-api-params';
import MapSidebarVirtualList from '@/redesign/components/MapSidebarVirtualList';
import { cn } from '@/lib/utils';
import CompareSessionChip from '@/shared/components/CompareSessionChip';
import SessionResumeBanner from '@/redesign/components/SessionResumeBanner';
import { patchSessionSnapshot } from '@/shared/lib/session-continuity';

const PER_PAGE = 200;

type CatalogPageMeta = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

type CatalogListResponse<T> = {
  data: T[];
  meta: CatalogPageMeta;
};

function formatMapSubtitle(loaded: number, total: number, refetching: boolean): string {
  const base =
    loaded < total ? `Показано ${loaded} из ${total} объектов` : `${total} объектов на карте`;
  return refetching ? `${base} · обновление…` : base;
}

function getListingPhoto(l: any): string | null {
  const tryUrl = (raw: unknown): string | null => {
    if (typeof raw === 'string' && raw.trim()) return raw;
    return null;
  };
  const fromArray = (arr: unknown): string | null => {
    if (!Array.isArray(arr)) return null;
    for (const it of arr) {
      const u = tryUrl(it);
      if (u) return u;
    }
    return null;
  };
  return (
    tryUrl(l.house?.photoUrl) ??
    fromArray(l.house?.extraPhotoUrls) ??
    tryUrl(l.land?.photoUrl) ??
    fromArray(l.land?.extraPhotoUrls) ??
    tryUrl(l.apartment?.finishingPhotoUrl) ??
    fromArray(l.apartment?.extraPhotoUrls) ??
    tryUrl(l.apartment?.planUrl) ??
    null
  );
}

function regionCenterFromRow(region?: RegionRow): [number, number] | null {
  const lat = Number(region?.mapCenterLat);
  const lng = Number(region?.mapCenterLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Комнатность из типа комнат донора; студия (0) сохраняется как 0, неизвестное — null. */
function roomsFromListing(l: any): number | null {
  const name = (l.apartment?.roomType?.name ?? '').toLowerCase();
  if (name.includes('студ')) return 0;
  const m = name.match(/(\d)/);
  if (m) return Math.min(4, parseInt(m[1], 10));
  const raw = l.apartment?.roomsCount;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
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

const RedesignMap = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // То же, что в каталоге: фильтры из адреса нужны уже на первом рендере.
  const [filters, setFilters] = useState<CatalogFilters>(() =>
    catalogFiltersFromSearchParams(new URLSearchParams(window.location.search)),
  );
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [activeListing, setActiveListing] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  /** Мобильная шторка со списком: свёрнута — видно край, развёрнута — почти весь экран */
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetTouchY = useRef<number | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const geoPreset = searchParams.get('geo_preset') ?? undefined;
  const geoPolygon = searchParams.get('geo_polygon') ?? undefined;
  const geoLat = searchParams.get('geo_lat');
  const geoLng = searchParams.get('geo_lng');
  const geoRadius = searchParams.get('geo_radius_m');

  const { data: defaultRegionId, rows: regionRows, setStoredRegionId, isLoading: regionLoading } = useDefaultRegionId();
  const urlRegionIdRaw = searchParams.get('region_id');
  const urlRegionId = urlRegionIdRaw ? parseInt(urlRegionIdRaw, 10) : NaN;
  const regionId =
    Number.isFinite(urlRegionId) && urlRegionId > 0 ? urlRegionId : defaultRegionId;
  const regionCenter = useMemo(
    () => regionCenterFromRow(regionRows?.find((r) => r.id === regionId)),
    [regionId, regionRows],
  );

  useEffect(() => {
    if (Number.isFinite(urlRegionId) && urlRegionId > 0) {
      setStoredRegionId(urlRegionId);
    }
  }, [urlRegionId, setStoredRegionId]);

  const debouncedSearch = useDebouncedValue(filters.search, CATALOG_SEARCH_DEBOUNCE_MS);
  const isSearchPending = filters.search !== debouncedSearch;
  useBodyScrollLock(showFilters);

  useEffect(() => {
    initMapSessionDiagnostics();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = searchParams.toString();
    patchSessionSnapshot({ mapHref: qs ? `/map?${qs}` : '/map' });
  }, [searchParams]);

  const objectType = filters.objectType;
  const useBlocksForApartments = objectType === 'apartments' && filters.marketType !== 'secondary';

  // Kind counts – drives the type switcher
  const kindCountsQuery = useQuery({
    queryKey: ['stats', 'listing-kind-counts', regionId],
    queryFn: () => apiGet<Record<string, number>>(`/stats/listing-kind-counts?region_id=${regionId ?? 1}`),
    enabled: Boolean(regionId),
    staleTime: 5 * 60 * 1000,
  });

  const kindCounts = kindCountsQuery.data ?? {};
  const objectKindLinks = useMemo(
    () => OBJECT_TYPE_TABS.map((x) => ({ ...x, count: kindCounts[x.countKey] ?? 0 })),
    [kindCounts],
  );
  const moscowMetro = useMemo(
    () => isMoscowRegion(regionRows, regionId),
    [regionId, regionRows],
  );

  // Deadlines (apartments only)
  const deadlinesQuery = useQuery({
    queryKey: ['blocks', 'deadlines', regionId],
    queryFn: () => apiGet<string[]>(`/blocks/deadlines?region_id=${regionId ?? 1}`),
    enabled: Boolean(regionId) && objectType === 'apartments',
    staleTime: 5 * 60 * 1000,
  });

  // Districts, subways, builders
  // Pass listing kind so districts list only shows areas with objects of selected type
  const districtKind = LISTING_KIND_BY_OBJECT_TYPE[objectType];
  const districtsQuery = useQuery({
    queryKey: ['districts', regionId, districtKind],
    queryFn: () => apiGet<{ name: string }[]>(`/districts?region_id=${regionId}&kind=${districtKind}`),
    enabled: regionId != null,
    select: (r) => r.map((x) => x.name),
  });

  const subwaysQuery = useQuery({
    queryKey: ['subways', regionId],
    queryFn: () => apiGet<{ name: string }[]>(`/subways?region_id=${regionId}`),
    enabled: regionId != null,
    select: (r) => r.map((x) => x.name),
  });

  const buildersQuery = useQuery({
    queryKey: ['builders', regionId],
    queryFn: () => apiGet<{ name: string }[]>(`/builders?region_id=${regionId}`),
    enabled: regionId != null && objectType === 'apartments',
    select: (r) => r.map((x) => x.name),
  });

  const mapUrlSig = useMemo(
    () => catalogFilterUrlSignature(new URLSearchParams(searchParams)),
    [searchParams.toString()],
  );

  useEffect(() => {
    setFilters(catalogFiltersFromSearchParams(new URLSearchParams(window.location.search)));
  }, [mapUrlSig]);

  useEffect(() => {
    syncDebouncedSearchInUrl(setSearchParams, filters.search, debouncedSearch);
  }, [debouncedSearch, filters.search, setSearchParams]);

  // Blocks query – only for apartments
  const blocksQuery = useQuery({
    queryKey: [
      'blocks', 'map', regionId, filters.marketType, debouncedSearch,
      filters.priceMin, filters.priceMax, filterKeyPart(filters.rooms),
      filters.areaMin, filters.areaMax, filters.floorMin, filters.floorMax,
      filterKeyPart(filters.status), filterKeyPart(filters.district),
      filterKeyPart(filters.subway), filterKeyPart(filters.builder),
      filterKeyPart(filters.deadline),
      filterKeyPart(filters.landPurpose),
      filterKeyPart(filters.commercialTypes),
      filterKeyPart(filters.houseMaterials),
      geoPreset, geoPolygon, geoLat, geoLng, geoRadius,
    ],
    queryFn: async () => {
      const sp = buildBlocksSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        page: 1,
        perPage: PER_PAGE,
        sort: 'name_asc',
        requireActiveListings: true,
        geo: { geoPreset, geoPolygon, geoLat, geoLng, geoRadius },
      });
      return apiGet<CatalogListResponse<ApiBlockListRow>>(`/blocks?${sp}`);
    },
    enabled: regionId != null && useBlocksForApartments,
    placeholderData: keepPreviousData,
  });

  const blocks = useMemo(
    () => blocksQuery.data?.data.map(mapApiBlockListRowToResidentialComplex) ?? [],
    [blocksQuery.data],
  );

  // Listings query – used when:
  //   1. objectType is not apartments, OR
  //   2. objectType is apartments but no blocks found
  const needListings = !useBlocksForApartments || (blocksQuery.isFetched && blocks.length === 0);

  const listingsQuery = useQuery({
    queryKey: [
      'listings', 'map', regionId, objectType,
      debouncedSearch,
      filters.priceMin, filters.priceMax,
      filters.areaMin, filters.areaMax,
      filters.landAreaMin, filters.landAreaMax,
      filters.distanceMin, filters.distanceMax,
      filterKeyPart(filters.directions), filterKeyPart(filters.houseLocation),
      filters.floorMin, filters.floorMax,
      filterKeyPart(filters.rooms), filterKeyPart(filters.district),
      filters.marketType,
      filterKeyPart(filters.landPurpose),
      filterKeyPart(filters.commercialTypes),
      filterKeyPart(filters.houseMaterials),
      geoPreset, geoPolygon, geoLat, geoLng, geoRadius,
    ],
    queryFn: async () => {
      const sp = buildListingsSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        kind: LISTING_KIND_BY_OBJECT_TYPE[objectType],
        page: 1,
        perPage: PER_PAGE,
        geo: { geoPreset, geoPolygon, geoLat, geoLng, geoRadius },
      });
      return apiGet<CatalogListResponse<Record<string, unknown>>>(`/listings?${sp}`);
    },
    enabled: regionId != null && needListings,
    placeholderData: keepPreviousData,
  });

  const listingItems = useMemo<ListingMapItem[]>(() => {
    const useApproximateCoords = objectType === 'apartments' && filters.marketType === 'secondary';
    return (listingsQuery.data?.data ?? [])
      .map((l: any, index: number) => {
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
          photoUrl: getListingPhoto(l),
          rooms: roomsFromListing(l),
          area: num(l.apartment?.areaTotal ?? l.house?.areaTotal ?? l.commercial?.area) || null,
          complexName: l.block?.name ?? null,
          deadline: l.apartment?.buildingDeadline ?? null,
        };
      })
      .filter((l): l is ListingMapItem => l != null);
  }, [filters.marketType, listingsQuery.data, objectType, regionCenter]);

  const blocksFilterSearchParams = useMemo(
    () =>
      buildBlocksSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        page: 1,
        perPage: PER_PAGE,
        sort: 'name_asc',
        requireActiveListings: true,
        geo: { geoPreset, geoPolygon, geoLat, geoLng, geoRadius },
      }),
    [
      filters,
      debouncedSearch,
      regionId,
      geoPreset,
      geoPolygon,
      geoLat,
      geoLng,
      geoRadius,
    ],
  );

  const listingsFilterSearchParams = useMemo(
    () =>
      buildListingsSearchParams({
        filters: { ...filters, search: debouncedSearch },
        regionId,
        kind: LISTING_KIND_BY_OBJECT_TYPE[objectType],
        page: 1,
        perPage: PER_PAGE,
        geo: { geoPreset, geoPolygon, geoLat, geoLng, geoRadius },
      }),
    [
      filters,
      debouncedSearch,
      regionId,
      objectType,
      geoPreset,
      geoPolygon,
      geoLat,
      geoLng,
      geoRadius,
    ],
  );

  // Decide what to show on map: blocks (for new-build apartments) or individual listings
  const useBlocksMap = useBlocksForApartments && blocks.length > 0;

  const blocksActive = regionId != null && useBlocksForApartments;
  const listingsActive = regionId != null && needListings;
  const displayBlocks = useBlocksMap;

  const catalogTotal = displayBlocks
    ? (blocksQuery.data?.meta.total ?? blocks.length)
    : (listingsQuery.data?.meta.total ?? listingItems.length);
  const loadedCount = displayBlocks ? blocks.length : listingItems.length;
  const hasPaginationGap = loadedCount < catalogTotal;

  const catalogInitialLoading =
    regionLoading ||
    (displayBlocks
      ? blocksQuery.isLoading
      : blocksActive && !blocksQuery.isFetched
        ? blocksQuery.isLoading
        : listingsActive
          ? listingsQuery.isLoading
          : false);

  const isCatalogRefetching =
    isSearchPending ||
    (displayBlocks
      ? blocksQuery.isFetching && !blocksQuery.isLoading
      : listingsActive && listingsQuery.isFetching && !listingsQuery.isLoading);

  const catalogFetchError = displayBlocks
    ? blocksQuery.error
    : listingsActive
      ? listingsQuery.error
      : null;

  const retryCatalog = () => {
    if (displayBlocks) void blocksQuery.refetch();
    else void listingsQuery.refetch();
  };

  const subtitle = catalogFetchError
      ? 'Не удалось загрузить объекты'
      : catalogInitialLoading && loadedCount === 0
        ? 'Загрузка…'
        : formatMapSubtitle(loadedCount, catalogTotal, isCatalogRefetching);

  const searchSuggestions = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (useBlocksMap) {
      return blocks
        .filter((c) => {
          if (!q) return true;
          return [c.name, c.address, c.district, c.subway].some((v) => v.toLowerCase().includes(q));
        })
        .slice(0, 6)
        .map((c) => ({
          id: c.slug,
          type: 'block' as const,
          label: c.name,
          meta: [c.district, c.address].filter((v) => v && v !== '—').join(' · '),
        }));
    }
    return listingItems
      .filter((l) => {
        if (!q) return true;
        return [l.title, l.address].some((v) => (v ?? '').toLowerCase().includes(q));
      })
      .slice(0, 6)
      .map((l) => ({
        id: String(l.id),
        type: 'listing' as const,
        label: l.title ?? l.address ?? `Объект #${l.id}`,
        meta: l.address ?? '',
      }));
  }, [blocks, filters.search, listingItems, useBlocksMap]);

  // Derive available objectType options from kindCounts
  const objectTypeOptions = useMemo(
    () => objectKindLinks.map((x) => x.type),
    [objectKindLinks],
  );

  const handleFiltersChange = useCallback(
    (next: CatalogFilters) => {
      setFilters(next);
      replaceCatalogFiltersInUrl(setSearchParams, next, regionId);
    },
    [regionId, setSearchParams],
  );

  const handleSearchInputChange = useCallback((search: string) => {
    setSuggestionsOpen(true);
    setFilters((prev) => ({ ...prev, search }));
  }, []);

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

  const handleSuggestionSelect = useCallback(
    (suggestion: (typeof searchSuggestions)[number]) => {
      setSuggestionsOpen(false);
      handleFiltersChange({ ...filters, search: suggestion.label });
      if (suggestion.type === 'block') {
        setActiveListing(null);
        setActiveBlock(suggestion.id);
      } else {
        setActiveBlock(null);
        setActiveListing(Number(suggestion.id));
      }
    },
    [filters, handleFiltersChange, searchSuggestions],
  );

  return (
    <div className="flex h-svh flex-col bg-background">
      <RedesignHeader />
      <h1 className="sr-only">Поиск недвижимости на карте</h1>
      <div className="shrink-0 px-3 pt-2 lg:px-4 print:hidden">
        <SessionResumeBanner />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Sidebar filters */}
        <aside className="hidden min-h-0 w-[280px] shrink-0 overflow-y-auto border-r border-border bg-background p-4 lg:block">
          <FilterSidebar
            filters={filters}
            onChange={handleFiltersChange}
            totalCount={catalogTotal}
            districtOptions={districtsQuery.data}
            subwayOptions={subwaysQuery.data}
            builderOptions={buildersQuery.data}
            deadlineOptions={deadlinesQuery.data}
            objectTypeOptions={objectTypeOptions.length > 0 ? objectTypeOptions : undefined}
            showMetro={moscowMetro}
            hasBlocks={useBlocksMap}
          />
        </aside>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Map */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 lg:min-w-0">
            <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:mb-3">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filters.search}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                  placeholder="Поиск по ЖК, адресу, району"
                  className={cn(
                    'h-9 bg-background pl-9 text-sm',
                    isSearchPending && 'border-primary/40',
                  )}
                  aria-busy={isSearchPending}
                />
                {suggestionsOpen && searchSuggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                    {searchSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.type}-${suggestion.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                      >
                        <span className="block truncate font-medium">{suggestion.label}</span>
                        {suggestion.meta ? (
                          <span className="block truncate text-xs text-muted-foreground">{suggestion.meta}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="text-sm font-semibold sm:ml-auto">{subtitle}</span>
              <Button variant="outline" size="sm" className="h-9 lg:hidden" onClick={() => setShowFilters(true)}>
                <SlidersHorizontal className="w-4 h-4 mr-1.5" /> Фильтры
              </Button>
            </div>
            <RegionSelector
              regions={regionRows}
              selectedRegionId={regionId}
              onSelect={handleRegionSelect}
              className="mb-2 shrink-0 lg:mb-3"
            />
            <div className="relative min-h-0 flex-1">
              {useBlocksMap ? (
                <MapSearch
                  complexes={blocks}
                  regionId={regionId}
                  regionCenter={regionCenter}
                  activeSlug={activeBlock}
                  onSelect={setActiveBlock}
                  height="100%"
                  compact
                  filterSearchParams={blocksFilterSearchParams}
                />
              ) : (
                <ListingsMapSearch
                  listings={listingItems}
                  regionId={regionId}
                  regionCenter={regionCenter}
                  activeId={activeListing}
                  onSelect={setActiveListing}
                  height="100%"
                  compact
                  filterSearchParams={listingsFilterSearchParams}
                />
              )}
            </div>
          </div>

          {/* Right sidebar list */}
          <aside
            className={cn(
              'flex min-h-0 shrink-0 flex-col overflow-hidden border-t border-border bg-background',
              // мобильный вид: шторка поверх полноэкранной карты
              'absolute inset-x-0 bottom-0 z-20 rounded-t-2xl shadow-[0_-8px_24px_rgba(15,23,42,0.12)]',
              'transition-[height] duration-200',
              sheetExpanded ? 'h-[82%]' : 'h-[38%]',
              // десктоп: обычная колонка справа
              'lg:static lg:z-auto lg:h-auto lg:max-h-none lg:w-[360px] lg:rounded-none lg:border-l lg:border-t-0 lg:bg-muted/20 lg:shadow-none',
            )}
          >
            <button
              type="button"
              aria-label={sheetExpanded ? 'Свернуть список' : 'Развернуть список'}
              aria-expanded={sheetExpanded}
              onClick={() => setSheetExpanded((v) => !v)}
              onTouchStart={(e) => {
                sheetTouchY.current = e.touches[0]?.clientY ?? null;
              }}
              onTouchEnd={(e) => {
                const start = sheetTouchY.current;
                const end = e.changedTouches[0]?.clientY ?? null;
                sheetTouchY.current = null;
                if (start == null || end == null) return;
                const dy = start - end;
                if (Math.abs(dy) < 30) return;
                setSheetExpanded(dy > 0);
              }}
              className="flex h-7 w-full shrink-0 items-center justify-center lg:hidden"
            >
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </button>
            <div className="px-3 py-2 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
              <p className="text-xs font-semibold text-foreground">
                {useBlocksMap ? 'Список ЖК' : 'Список объектов'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Нажмите строку, и метка на карте подсветится
              </p>
              {hasPaginationGap && !catalogFetchError ? (
                <p className="text-[10px] text-warning mt-1">
                  Показано {loadedCount} из {catalogTotal} объектов
                </p>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {catalogInitialLoading && loadedCount === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Загрузка…</p>
              ) : catalogFetchError ? (
                <div className="flex flex-col items-start gap-2 p-3">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      Не удалось загрузить объекты. Проверьте соединение и попробуйте снова.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={retryCatalog}>
                    Повторить
                  </Button>
                </div>
              ) : useBlocksMap ? (
                blocks.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">Нет объектов по фильтрам.</p>
                ) : (
                  <MapSidebarVirtualList
                    mode="blocks"
                    blocks={blocks}
                    activeSlug={activeBlock}
                    onSelectBlock={setActiveBlock}
                    listResetKey={mapUrlSig}
                  />
                )
              ) : listingItems.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Нет объектов по фильтрам.</p>
              ) : (
                <MapSidebarVirtualList
                  mode="listings"
                  listings={listingItems}
                  activeId={activeListing}
                  onSelectListing={setActiveListing}
                  listResetKey={mapUrlSig}
                />
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile filter overlay */}
      {showFilters && (
        <div className="fixed inset-0 z-[60] bg-background overflow-y-auto animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between h-14 px-4 border-b border-border sticky top-0 bg-background z-10">
            <span className="font-semibold">Фильтры</span>
            <button type="button" onClick={() => setShowFilters(false)} className="w-10 h-10 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 pb-24">
            <FilterSidebar
              filters={filters}
              onChange={handleFiltersChange}
              totalCount={catalogTotal}
              districtOptions={districtsQuery.data}
              subwayOptions={subwaysQuery.data}
              builderOptions={buildersQuery.data}
              deadlineOptions={deadlinesQuery.data}
              objectTypeOptions={objectTypeOptions.length > 0 ? objectTypeOptions : undefined}
              showMetro={moscowMetro}
              hasBlocks={useBlocksMap}
            />
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
            <Button className="w-full h-12" onClick={() => setShowFilters(false)}>
              {hasPaginationGap
                ? `Показать ${loadedCount} из ${catalogTotal} объектов`
                : `Показать ${catalogTotal} объектов`}
            </Button>
          </div>
        </div>
      )}

      <CompareSessionChip />
    </div>
  );
};

export default RedesignMap;
