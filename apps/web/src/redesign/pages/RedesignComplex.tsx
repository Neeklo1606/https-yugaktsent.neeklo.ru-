import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Heart, Share2, GitCompare, FileText, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ComplexCard from '@/redesign/components/ComplexCard';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import ComplexPremiumGallery from '@/redesign/components/ComplexPremiumGallery';
import ComplexPageHeader from '@/redesign/components/ComplexPageHeader';
import ComplexQuickMeta from '@/redesign/components/ComplexQuickMeta';
import ComplexStickySidebar from '@/redesign/components/ComplexStickySidebar';
import ComplexInlineFilters from '@/redesign/components/ComplexInlineFilters';
import ComplexQueueTable from '@/redesign/components/ComplexQueueTable';
import ComplexAnchorNav, { type ComplexSection } from '@/redesign/components/ComplexAnchorNav';
import Chessboard from '@/redesign/components/Chessboard';
import type { ChessboardBlockResponse } from '@/redesign/lib/chessboard-api';
import ChessDebugOverlay from '@/redesign/components/ChessDebugOverlay';
import ConversionDebugOverlay from '@/redesign/components/ConversionDebugOverlay';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import { CONVERSION_CTA, type ConsultationContext } from '@/redesign/lib/conversion-cta';
import LayoutGrid from '@/redesign/components/LayoutGrid';
import LeadForm from '@/shared/components/LeadForm';
import RelatedListingsCarousel from '@/discovery/components/RelatedListingsCarousel';
import { apiGet, apiGetOrNull } from '@/lib/api';
import {
  formatPriceFrom,
  formatPriceRangeDisplay,
  compareByPrice,
  PRICE_ON_REQUEST_CLASS,
  isPriceFallbackText,
  formatDisplayPrice,
  priceAriaLabel,
  isPriceHidden,
} from '@/redesign/lib/display-price';
import type { Apartment, ResidentialComplex, SortField, SortDir } from '@/redesign/data/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/shared/hooks/useAuth';
import { parseApiBlockId, useFavorites } from '@/shared/hooks/useFavorites';
import { useCompare } from '@/shared/hooks/useCompare';
import { shareCurrentPage } from '@/lib/share-page';
import { useEntitySeoMeta } from '@/shared/hooks/useEntitySeoMeta';
import { toast } from '@/components/ui/sonner';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { useInViewOnce } from '@/shared/hooks/useInViewOnce';
import { prefersReducedMotion } from '@/redesign/lib/map-sidebar-scroll-utils';
import {
  buildLayoutGroupsFromApartments,
  mapApiBlockDetailToResidentialComplex,
  mapApiBlockListRowToResidentialComplex,
  type ApiBlockDetail,
  type ApiBlockListRow,
  type ApiListingRow,
} from '@/redesign/lib/blocks-from-api';
import { buildCatalogFilterUrl } from '@/redesign/lib/catalog-filter-links';
import { roomCategoryFromRooms } from '@/redesign/lib/complex-room-groups';
import { recordBrowseHistory } from '@/shared/lib/record-browse-history';
import { blockHref } from '@/shared/lib/browse-history-local';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';

declare global {
  interface Window { ymaps: any; }
}

const COMPLEX_SLUG_ALIASES: Record<string, string> = {
  'zelenyj-kvartal': '1-j-lermontovskij',
};

function sectionHeading(title: string, subtitle?: string) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="text-base sm:text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle ? (
        <span className="text-xs text-muted-foreground font-normal">{subtitle}</span>
      ) : null}
    </div>
  );
}

const RedesignComplex = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isBlockFavorite, toggleBlock } = useFavorites();
  const { isCompared, toggle: toggleCompare, count: compareCount } = useCompare();
  const { shortName } = useSiteBrand();
  const resolvedSlug = useMemo(() => {
    const raw = (slug || '').trim();
    if (!raw) return raw;
    return COMPLEX_SLUG_ALIASES[raw] ?? raw;
  }, [slug]);

  const [chessboardEnabled, setChessboardEnabled] = useState(false);
  const chessboardSectionRef = useRef<HTMLElement | null>(null);

  const apiBlockQuery = useQuery({
    queryKey: ['block', 'slug', resolvedSlug],
    queryFn: () => apiGetOrNull<ApiBlockDetail>(`/blocks/${encodeURIComponent(resolvedSlug || '')}`),
    enabled: Boolean(resolvedSlug),
    staleTime: 600_000,
  });

  const listingsQuery = useQuery({
    queryKey: ['listings', 'block', apiBlockQuery.data?.id],
    queryFn: () =>
      apiGet<{ data: ApiListingRow[] }>(
        `/listings?block_id=${apiBlockQuery.data!.id}&statuses=ACTIVE,RESERVED,SOLD&is_published=true&per_page=48`,
      ),
    enabled: Boolean(apiBlockQuery.data?.id),
  });

  const chessboardQuery = useQuery({
    queryKey: ['block', 'chessboard', resolvedSlug],
    queryFn: () =>
      apiGetOrNull<ChessboardBlockResponse>(
        `/blocks/${encodeURIComponent(resolvedSlug || '')}/chessboard`,
      ),
    enabled: Boolean(resolvedSlug) && Boolean(apiBlockQuery.data?.id) && chessboardEnabled,
    staleTime: 60_000,
  });

  const apiComplex = useMemo(() => {
    if (!apiBlockQuery.data) return null;
    const rows = listingsQuery.data?.data ?? [];
    return mapApiBlockDetailToResidentialComplex(apiBlockQuery.data, rows);
  }, [apiBlockQuery.data, listingsQuery.data]);

  const complex = apiComplex ?? null;
  const fromApi = Boolean(apiComplex);
  const regionId = apiBlockQuery.data?.region?.id ?? null;

  const districtCatalogUrl =
    regionId && complex?.district && complex.district !== '—'
      ? buildCatalogFilterUrl(regionId, { district: complex.district })
      : null;
  const subwayCatalogUrl =
    regionId && complex?.subway && complex.subway !== '—'
      ? buildCatalogFilterUrl(regionId, { subway: complex.subway })
      : null;

  const entitySeo = useMemo(() => {
    if (!complex) return null;
    const priceHint =
      ` ${formatPriceFrom(complex.priceFrom)}`;
    const desc = `${complex.name}${priceHint}. ${complex.district || complex.address}. Квартиры, планировки и шахматка на ${shortName}.`.slice(
      0,
      160,
    );
    return {
      title: complex.name,
      description: desc,
      pathname: location.pathname,
      imageUrl: complex.images[0] ?? null,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Residence',
        name: complex.name,
        url: `${window.location.origin}${location.pathname}`,
        ...(complex.images[0] ? { image: complex.images[0] } : {}),
        address: complex.address || complex.district,
      },
    };
  }, [complex, location.pathname, shortName]);
  useEntitySeoMeta(entitySeo);

  useEffect(() => {
    const b = apiBlockQuery.data;
    if (!b?.id || !complex) return;
    void recordBrowseHistory('BLOCK', b.id, complex.name, blockHref(b.id, b.slug));
  }, [apiBlockQuery.data, complex?.name, complex?.id]);

  const blockNum = complex ? parseApiBlockId(complex.id) : null;
  const blockLiked = blockNum != null && isBlockFavorite(blockNum);

  const similarQuery = useQuery({
    queryKey: ['blocks', 'similar', apiBlockQuery.data?.id],
    queryFn: async () => {
      const b = apiBlockQuery.data!;
      const rid = b.region?.id;
      if (rid == null) return [] as ResidentialComplex[];

      const nearby = await apiGet<{ data: Array<{ id: number; slug: string; name: string }> }>(
        `/discovery/blocks/${b.id}/nearby?limit=6`,
      );
      const nearbyIds = new Set(nearby.data?.map((x) => x.id) ?? []);
      if (nearbyIds.size > 0) {
        const params = new URLSearchParams({ region_id: String(rid), per_page: '24' });
        const res = await apiGet<{ data: ApiBlockListRow[] }>(`/blocks?${params.toString()}`);
        return res.data
          .filter((row) => nearbyIds.has(row.id))
          .slice(0, 6)
          .map(mapApiBlockListRowToResidentialComplex);
      }

      const params = new URLSearchParams({ region_id: String(rid), per_page: '12' });
      const districtName = b.district?.name?.trim();
      if (districtName) params.set('district_names', districtName);
      const res = await apiGet<{ data: ApiBlockListRow[] }>(`/blocks?${params.toString()}`);
      return res.data
        .filter((row) => row.id !== b.id)
        .slice(0, 4)
        .map(mapApiBlockListRowToResidentialComplex);
    },
    enabled: Boolean(fromApi && apiBlockQuery.data?.id != null),
  });

  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'price', dir: 'asc' });
  const [aptSearch, setAptSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState<number | null>(null);
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('');
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultContext, setConsultContext] = useState<ConsultationContext | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInView = useInViewOnce(mapRef);
  const { ready: ymapsReady } = useYandexMapsReady({ enabled: mapInView });
  const mapInstanceRef = useRef<any>(null);
  const mapInitializedRef = useRef(false);

  const similarComplexes = useMemo((): ResidentialComplex[] => {
    if (!complex) return [];
    // Похожих нет — показываем пустой блок, а не чужие комплексы
    return similarQuery.data ?? [];
  }, [complex, similarQuery.data]);

  const buildings = complex?.buildings ?? [];
  const activeBuilding = useMemo(() => {
    if (!buildings.length) return null;
    if (activeBuildingId) {
      return buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];
    }
    return buildings[0];
  }, [buildings, activeBuildingId]);

  const activeChessMatrix = useMemo(() => {
    const boards = chessboardQuery.data?.buildings;
    if (!boards?.length) return null;
    if (activeBuildingId) {
      return boards.find((b) => b.id === activeBuildingId) ?? boards[0];
    }
    return boards[0];
  }, [chessboardQuery.data, activeBuildingId]);

  const chessBuildingOptions = useMemo(
    () =>
      chessboardQuery.data?.buildings.map((b) => ({
        id: b.id,
        name: b.tabLabel,
        apartmentCount: b.apartmentCount,
      })),
    [chessboardQuery.data],
  );

  useEffect(() => {
    if (buildings.length && !activeBuildingId) {
      setActiveBuildingId(buildings[0].id);
    }
  }, [buildings, activeBuildingId]);

  useEffect(() => {
    const boards = chessboardQuery.data?.buildings;
    if (!boards?.length) return;
    if (!activeBuildingId || !boards.some((b) => b.id === activeBuildingId)) {
      setActiveBuildingId(boards[0].id);
    }
  }, [chessboardQuery.data, activeBuildingId]);

  const scopedApartments = useMemo(() => {
    if (!complex) return [];
    const source = activeBuilding
      ? activeBuilding.apartments
      : complex.buildings.flatMap((b) => b.apartments);
    const apts = source.filter((a) => a.status !== 'sold');
    apts.sort((a, b) => {
      if (sort.field === 'price') {
        return compareByPrice(a.price, b.price, sort.dir);
      }
      const m = sort.dir === 'asc' ? 1 : -1;
      return (a[sort.field] - b[sort.field]) * m;
    });
    return apts;
  }, [complex, activeBuilding, sort]);

  const layouts = useMemo(() => {
    if (!complex) return [];
    const apts = activeBuilding
      ? activeBuilding.apartments
      : complex.buildings.flatMap((b) => b.apartments);
    if (fromApi) {
      return buildLayoutGroupsFromApartments(complex.id, apts);
    }
    return [];
  }, [complex, fromApi, activeBuilding]);

  const hasApartments = scopedApartments.length > 0;
  const hasLayouts = layouts.length > 0;
  const hasChess =
    (apiBlockQuery.data?._count?.listings ?? 0) > 0 ||
    buildings.some((b) => b.apartments.length > 0);

  useEffect(() => {
    if (chessboardEnabled || !hasChess) return;
    const el = chessboardSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setChessboardEnabled(true);
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [chessboardEnabled, hasChess, complex?.id]);
  const hasDescription = Boolean(complex?.description?.trim());
  const hasInfra = (complex?.infrastructure.length ?? 0) > 0;
  const hasMap =
    complex != null &&
    Array.isArray(complex.coords) &&
    complex.coords.length === 2 &&
    Number.isFinite(complex.coords[0]) &&
    Number.isFinite(complex.coords[1]) &&
    (complex.coords[0] !== 0 || complex.coords[1] !== 0);
  const hasDeveloper = Boolean(complex?.builder?.trim() && complex.builder !== '—');
  const hasBuildings = buildings.length > 0;

  const navSections = useMemo((): ComplexSection[] => {
    const s: ComplexSection[] = [];
    if (hasBuildings || hasApartments || hasLayouts) s.push({ id: 'layouts', label: 'Квартиры' });
    if (hasChess) s.push({ id: 'chessboard', label: 'Шахматка' });
    if (hasLayouts) s.push({ id: 'plans', label: 'Планировки' });
    if (hasMap) s.push({ id: 'map', label: 'Карта' });
    if (hasDescription || hasInfra) s.push({ id: 'description', label: 'Об объекте' });
    if (hasDeveloper) s.push({ id: 'developer', label: 'Застройщик' });
    if (similarComplexes.length > 0) s.push({ id: 'similar', label: 'Похожие' });
    return s;
  }, [hasApartments, hasChess, hasDescription, hasInfra, hasMap, hasDeveloper, hasBuildings, hasLayouts, similarComplexes.length]);

  const initMap = useCallback(() => {
    if (!ymapsReady || !complex || mapInstanceRef.current || !mapRef.current || !window.ymaps) return;
    window.ymaps.ready(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, {
        center: complex.coords,
        zoom: 15,
        controls: ['zoomControl'],
      });
      const pm = new window.ymaps.Placemark(
        complex.coords,
        {
          balloonContentHeader: `<strong>${complex.name}</strong>`,
          balloonContentBody: `<div>${complex.address}</div>`,
        },
        { preset: 'islands#blueCircleDotIcon' },
      );
      map.geoObjects.add(pm);
      mapInstanceRef.current = map;
      mapInitializedRef.current = true;
    });
  }, [ymapsReady, complex]);

  const scrollToSection = useCallback(
    (id: string) => {
      const sectionId =
        id === 'chess' ? 'chessboard' : id === 'apartments' ? 'layouts' : id;
      if (sectionId === 'chessboard') setChessboardEnabled(true);
      setActiveSection(sectionId);
      const el = document.getElementById(sectionId);
      if (!el) return;
      el.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      if (sectionId === 'map' && !mapInitializedRef.current) {
        window.setTimeout(() => initMap(), 150);
      }
    },
    [initMap],
  );

  useEffect(() => {
    if (!navSections.length) return;
    const ids = navSections.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [navSections, complex?.slug]);

  useEffect(() => {
    if (!hasMap) return;
    const el = document.getElementById('map');
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) initMap();
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMap, initMap]);

  const filterApartments = useCallback(
    (apartments: Apartment[]) => {
      const q = aptSearch.trim().toLowerCase();
      return apartments.filter((a) => {
        if (roomFilter !== null && roomCategoryFromRooms(a.rooms ?? 0) !== roomFilter) return false;
        if (!q) return true;
        const num = a.number?.toLowerCase() ?? '';
        return num.includes(q) || String(a.id).toLowerCase().includes(q);
      });
    },
    [aptSearch, roomFilter],
  );

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const inCompare = complex ? isCompared(complex.slug) : false;

  const openComplexConsult = useCallback(
    (source: string) => {
      if (!complex) return;
      setConsultContext({
        surface: 'complex',
        source,
        blockId: blockNum ?? undefined,
        contextFooter: `ЖК «${complex.name}»`,
      });
      setConsultOpen(true);
    },
    [blockNum, complex],
  );

  const buildingFilterOptions = useMemo(
    () => buildings.map((b) => ({ id: b.id, label: b.name || `Корпус ${b.id}` })),
    [buildings],
  );

  const metroItems = (complex?.nearbySubways ?? []).slice(0, 8);
  const availableCount = useMemo(() => {
    if (!complex) return 0;
    return (
      complex.buildings.reduce((s, b) => s + b.apartments.filter((a) => a.status === 'available').length, 0) ||
      complex.listingCount ||
      0
    );
  }, [complex]);

  if (!complex) {
    if (slug && apiBlockQuery.isPending) {
      return (
        <div className="min-h-screen bg-background">
          <RedesignHeader />
          <div className="max-w-[1400px] mx-auto px-4 py-16 text-center text-muted-foreground text-sm">Загрузка…</div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background">
        <RedesignHeader />
        <div className="max-w-[1400px] mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Комплекс не найден</p>
          <Link to="/catalog" className="text-primary text-sm mt-2 inline-block">
            ← Вернуться в каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32 lg:pb-8">
      <RedesignHeader />

      <div className="max-w-[1400px] 2xl:max-w-[1680px] mx-auto px-4 py-4 sm:py-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 min-w-0 flex-wrap">
            <Link to="/" className="inline-flex min-h-8 shrink-0 items-center hover:text-foreground">Главная</Link>
            <span>/</span>
            {regionId ? (
              <>
                <Link to={buildCatalogFilterUrl(regionId)} className="inline-flex min-h-8 shrink-0 items-center hover:text-foreground">Каталог</Link>
                {districtCatalogUrl ? (
                  <>
                    <span>/</span>
                    <Link to={districtCatalogUrl} className="inline-flex min-h-8 items-center truncate max-w-[120px] hover:text-foreground sm:max-w-none">{complex.district}</Link>
                  </>
                ) : null}
              </>
            ) : (
              <Link to="/catalog" className="inline-flex min-h-8 shrink-0 items-center hover:text-foreground">Каталог</Link>
            )}
            <span>/</span>
            <span className="text-foreground font-medium truncate">{complex.name}</span>
          </nav>

        <ComplexPageHeader
          complex={complex}
          actions={[
            {
              key: 'fav',
              icon: <Heart className={cn('w-4 h-4', blockLiked && 'fill-destructive text-destructive')} />,
              label: blockLiked ? 'В избранном' : 'В избранное',
              disabled: blockNum == null,
              active: blockLiked,
              onClick: () => {
                if (blockNum == null) return;
                if (!isAuthenticated) {
                  navigate('/login', { state: { from: location } });
                  return;
                }
                void toggleBlock(blockNum);
              },
            },
            {
              key: 'compare',
              icon: <GitCompare className="w-4 h-4" />,
              label: inCompare ? 'В сравнении' : 'Сравнить',
              active: inCompare,
              onClick: () => {
                if (!inCompare && compareCount >= 3) {
                  toast.error('В сравнении не более 3 ЖК');
                  return;
                }
                toggleCompare(complex.slug);
              },
            },
            {
              key: 'pdf',
              icon: <FileText className="w-4 h-4" />,
              label: 'Презентация PDF',
              href: `/presentation/${complex.slug}`,
            },
            {
              key: 'share',
              icon: <Share2 className="w-4 h-4" />,
              label: 'Поделиться',
              onClick: () => void shareCurrentPage({ title: complex.name }),
            },
          ]}
        />

        <ComplexAnchorNav
          sections={navSections}
          activeId={activeSection || navSections[0]?.id || ''}
          onNavigate={scrollToSection}
        />

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-6 xl:gap-7 lg:items-start">
          <div className="min-w-0">
            <ComplexPremiumGallery images={complex.images} title={complex.name} />
            <ComplexQuickMeta complex={complex} districtCatalogUrl={districtCatalogUrl} subwayCatalogUrl={subwayCatalogUrl} />
            <div className="lg:hidden mt-4">
              <ComplexStickySidebar
                complex={complex}
                availableCount={availableCount}
                onConsultation={() => openComplexConsult(`complex:${complex.slug}:mobile-sidebar`)}
              />
            </div>

        <div className="space-y-8 sm:space-y-10 mt-6">
          {hasBuildings || hasApartments || hasLayouts ? (
            <section id="layouts" className="scroll-mt-28">
              {sectionHeading('Квартиры', hasApartments ? `${scopedApartments.length} предложений` : undefined)}
              {hasApartments ? (
                <div className="space-y-4">
                  <ComplexInlineFilters
                    search={aptSearch}
                    onSearchChange={setAptSearch}
                    roomFilter={roomFilter}
                    onRoomFilter={setRoomFilter}
                    sort={sort}
                    onSort={handleSort}
                    buildingOptions={buildingFilterOptions}
                    activeBuildingId={activeBuildingId}
                    onBuildingChange={setActiveBuildingId}
                  />
                  <ComplexQueueTable
                      buildings={
                        buildings.length > 0
                          ? buildings
                          : [
                              {
                                id: 'main',
                                complexId: complex.id,
                                name: complex.name,
                                floors: 1,
                                sections: 1,
                                deadline: complex.deadline,
                                apartments: scopedApartments,
                              },
                            ]
                      }
                      sort={sort}
                      onSort={handleSort}
                      filterApartments={filterApartments}
                      activeBuildingId={buildings.length > 1 ? activeBuildingId : null}
                    />
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
                  Свободных квартир пока нет
                </div>
              )}
            </section>
          ) : null}

          {hasChess && fromApi ? (
            <section ref={chessboardSectionRef} id="chessboard" className="scroll-mt-32">
              {sectionHeading('Шахматка', activeBuilding?.name || 'Расположение квартир по этажам')}
              {!chessboardEnabled ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Прокрутите к разделу или выберите «Шахматка» в меню, и данные подгрузятся автоматически
                </div>
              ) : chessboardQuery.isError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-muted-foreground">
                  Не удалось загрузить шахматку. Обновите страницу.
                </div>
              ) : activeChessMatrix ? (
                <Chessboard
                  matrix={activeChessMatrix}
                  buildingName={activeChessMatrix.name}
                  roomFilter={roomFilter}
                  buildingOptions={
                    chessBuildingOptions && chessBuildingOptions.length > 1
                      ? chessBuildingOptions
                      : undefined
                  }
                  activeBuildingId={activeBuildingId}
                  onBuildingChange={setActiveBuildingId}
                  isLoading={chessboardQuery.isFetching}
                />
              ) : chessboardQuery.isLoading ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground animate-pulse">
                  Загрузка шахматки…
                </div>
              ) : null}
            </section>
          ) : null}

          {hasLayouts ? (
            <section id="plans" className="scroll-mt-28">
              {sectionHeading('Планировки', `${layouts.length} типов`)}
              <LayoutGrid layouts={layouts} complexSlug={complex.slug} />
            </section>
          ) : null}

          {(hasDescription || hasInfra) ? (
            <section id="description" className="scroll-mt-28">
              {sectionHeading('Об объекте')}
              <div className="bg-card rounded-xl border border-border/70 p-4 sm:p-5 space-y-4 max-w-3xl">
                {complex.description.includes('<') ? (
                  <div
                    className="text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: complex.description }}
                  />
                ) : hasDescription ? (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-w-prose">{complex.description}</p>
                ) : null}
                {metroItems.length > 0 ? (
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
                    <p className="text-sm font-medium">{complex.address}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      {metroItems.map((m) => (
                        <div key={`${m.name}-${m.distanceTime ?? 'na'}`} className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
                          {regionId ? (
                            <Link
                              to={buildCatalogFilterUrl(regionId, { subway: m.name })}
                              className="hover:text-primary hover:underline"
                            >
                              {m.name}
                              {m.distanceTime != null
                                ? `, ${m.distanceTime} минут ${m.distanceType === 1 ? 'пешком' : 'транспортом'}`
                                : ''}
                            </Link>
                          ) : (
                            <span>
                              {m.name}
                              {m.distanceTime != null
                                ? `, ${m.distanceTime} минут ${m.distanceType === 1 ? 'пешком' : 'транспортом'}`
                                : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {hasInfra ? (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                    {complex.infrastructure.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/25 px-3 py-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-sm">
                  {[
                    ['Адрес', complex.address || '—'],
                    ['Район', complex.district || '—'],
                    ['Метро', complex.subway && complex.subway !== '—' ? `${complex.subway} (${complex.subwayDistance})` : '—'],
                    ['Срок сдачи', complex.deadline || '—'],
                    ['Корпусов', String(buildings.length)],
                    ['Цена', formatPriceRangeDisplay(complex.priceFrom, complex.priceTo)],
                  ].map(([label, value]) => (
                    <div key={label} className="space-y-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {label === 'Район' && districtCatalogUrl ? (
                        <Link to={districtCatalogUrl} className="text-sm font-medium hover:text-primary hover:underline">
                          {value}
                        </Link>
                      ) : label === 'Метро' && subwayCatalogUrl ? (
                        <Link to={subwayCatalogUrl} className="text-sm font-medium hover:text-primary hover:underline">
                          {value}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium">{value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {hasMap ? (
            <section id="map" className="scroll-mt-28">
              {sectionHeading('На карте')}
              <div className="rounded-xl border border-border/70 overflow-hidden bg-card shadow-sm">
                <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{complex.address}</span>
                </div>
                <div ref={mapRef} className="h-[min(320px,42vh)] min-h-[200px] bg-muted" />
              </div>
            </section>
          ) : null}

          {hasDeveloper ? (
            <section id="developer" className="scroll-mt-32">
              {sectionHeading('Застройщик')}
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6 flex gap-4 items-start">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-base">{complex.builder}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {complex.district && complex.district !== '—' ? (
                      districtCatalogUrl ? (
                        <>
                          Район:{' '}
                          <Link to={districtCatalogUrl} className="hover:text-primary hover:underline">
                            {complex.district}
                          </Link>
                        </>
                      ) : (
                        `Район: ${complex.district}`
                      )
                    ) : (
                      'Застройщик проекта'
                    )}
                  </p>
                  {!isPriceHidden(complex.priceFrom) ? (
                    <p className="text-sm mt-2" aria-label={priceAriaLabel(formatPriceFrom(complex.priceFrom))}>
                      Квартиры от {formatPriceFrom(complex.priceFrom)}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section id="lead" className="scroll-mt-32">
            {sectionHeading('Получить консультацию', 'Оставьте заявку, и менеджер свяжется с вами')}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 sm:p-6">
                <LeadForm
                  title=""
                  embedded
                  source={`ЖК: ${complex.slug}`}
                  blockId={fromApi && apiBlockQuery.data ? apiBlockQuery.data.id : undefined}
                  requestType="CONSULTATION"
                />
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-3 h-fit">
                <p className="text-xs text-muted-foreground">Сводка</p>
                <p className={cn("text-xl font-bold", isPriceFallbackText(formatPriceFrom(complex.priceFrom)) && PRICE_ON_REQUEST_CLASS)} aria-label={priceAriaLabel(formatPriceFrom(complex.priceFrom))}>
                  {formatPriceFrom(complex.priceFrom)}
                </p>
                {!isPriceHidden(complex.priceTo) ? (
                  <p className="text-xs text-muted-foreground">{formatDisplayPrice(complex.priceTo, { prefix: 'до' })}</p>
                ) : null}
                <div className="border-t border-border pt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Свободных кв.</span>
                    <span className="font-medium">{availableCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Срок сдачи</span>
                    <span className="font-medium">{complex.deadline}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {fromApi && apiBlockQuery.data?.id ? (
            <RelatedListingsCarousel
              title="Объекты в этом ЖК и рядом"
              fetchUrl={`/discovery/blocks/${apiBlockQuery.data.id}/related?limit=12`}
              queryKey={['discovery', 'related', 'block', apiBlockQuery.data.id]}
              className="scroll-mt-32"
            />
          ) : null}

          {similarComplexes.length > 0 ? (
            <section id="similar" className="scroll-mt-32">
              {sectionHeading('Похожие жилые комплексы')}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
                {similarComplexes.map((c) => (
                  <div key={c.id} className="flex h-full min-h-0">
                    <ComplexCard complex={c} variant="compact" coverAspect="16/9" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
          </div>
          <aside className="hidden lg:block sticky top-20 self-start">
            <ComplexStickySidebar
              complex={complex}
              availableCount={availableCount}
              onConsultation={() => openComplexConsult(`complex:${complex.slug}:sidebar`)}
            />
          </aside>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm p-3 lg:hidden safe-area-pb">
        <div className="flex gap-2 max-w-[1400px] mx-auto">
          <Button
            variant="primary"
            className="flex-1"
            type="button"
            onClick={() => openComplexConsult(`complex:${complex.slug}:sticky`)}
          >
            {CONVERSION_CTA.consultation}
          </Button>
          <Button variant="secondary" className="px-4" asChild>
            <Link to={`/presentation/${complex.slug}`}>PDF</Link>
          </Button>
        </div>
      </div>

      <ConsultationFlow open={consultOpen} onOpenChange={setConsultOpen} context={consultContext} />
      <ChessDebugOverlay />
      <ConversionDebugOverlay />
      <FooterSection />
    </div>
  );
};

export default RedesignComplex;
