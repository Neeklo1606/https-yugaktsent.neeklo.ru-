import { useParams, Link, useLocation } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MapPin, Heart, Share2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ComplexCard from '@/redesign/components/ComplexCard';
import SnapRail from '@/redesign/components/home/SnapRail';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import ComplexPremiumGallery from '@/redesign/components/ComplexPremiumGallery';
import ComplexSummaryCard, { flatsWord } from '@/redesign/components/ComplexSummaryCard';
import Reveal from '@/shared/components/Reveal';
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
import { parseApiBlockId, useFavorites } from '@/shared/hooks/useFavorites';
import { shareCurrentPage } from '@/lib/share-page';
import { useEntitySeoMeta } from '@/shared/hooks/useEntitySeoMeta';
import { complexJsonLd, complexSeoText } from '@/shared/seo/structured-seo';
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
import DOMPurify from 'dompurify';
import { ObjectPageSkeleton, PageLoadError, PageNotFound } from '@/redesign/components/PageLoadState';

declare global {
  interface Window { ymaps: any; }
}

const COMPLEX_SLUG_ALIASES: Record<string, string> = {
  'zelenyj-kvartal': '1-j-lermontovskij',
};

function sectionHeading(title: string, subtitle?: string) {
  return (
    <div className="mb-4">
      <h2 className="text-[22px] font-semibold leading-tight tracking-tight lg:text-2xl">{title}</h2>
      {subtitle ? <p className="mt-1 text-[14px] text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

const RedesignComplex = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { isBlockFavorite, toggleBlock } = useFavorites();
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

  // Квартиры порциями по 48 с кнопкой «Показать ещё»: раньше показывались только первые 48 из сотен
  const listingsQuery = useInfiniteQuery({
    queryKey: ['listings', 'block-pages', apiBlockQuery.data?.id],
    queryFn: ({ pageParam }) =>
      apiGet<{ data: ApiListingRow[]; meta?: { total?: number; total_pages?: number; page?: number } }>(
        `/listings?block_id=${apiBlockQuery.data!.id}&statuses=ACTIVE,RESERVED,SOLD&is_published=true&per_page=48&page=${pageParam}&sort=price_asc`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const pages = Number(last.meta?.total_pages) || 1;
      return all.length < pages ? all.length + 1 : undefined;
    },
    enabled: Boolean(apiBlockQuery.data?.id),
  });
  const listingRows = useMemo(() => listingsQuery.data?.pages.flatMap((p) => p.data) ?? [], [listingsQuery.data]);
  const listingsTotal = listingsQuery.data?.pages[0]?.meta?.total ?? listingRows.length;

  const chessboardQuery = useQuery({
    queryKey: ['block', 'chessboard', resolvedSlug],
    queryFn: () =>
      apiGetOrNull<ChessboardBlockResponse>(
        `/blocks/${encodeURIComponent(resolvedSlug || '')}/chessboard`,
      ),
    enabled: Boolean(resolvedSlug) && Boolean(apiBlockQuery.data?.id) && chessboardEnabled,
    staleTime: 60_000,
  });

  // Детальный ответ API не содержит цен по комнатности, а загружаем мы лишь первые 48 квартир.
  // Берём price_ranges из списочного ответа — те же цифры, что на карточке каталога.
  const priceRangesQuery = useQuery({
    queryKey: ['block', 'price-ranges', apiBlockQuery.data?.id],
    queryFn: async () => {
      const b = apiBlockQuery.data!;
      const sp = new URLSearchParams({ per_page: '10', search: b.name });
      if (b.region?.id != null) sp.set('region_id', String(b.region.id));
      const res = await apiGet<{ data: ApiBlockListRow[] }>(`/blocks?${sp}`);
      return res.data.find((row) => row.id === b.id)?.priceRanges ?? null;
    },
    enabled: Boolean(apiBlockQuery.data?.id),
    staleTime: 600_000,
  });

  const apiComplex = useMemo(() => {
    if (!apiBlockQuery.data) return null;
    const mapped = mapApiBlockDetailToResidentialComplex(apiBlockQuery.data, listingRows);
    return priceRangesQuery.data?.length ? { ...mapped, priceRanges: priceRangesQuery.data } : mapped;
  }, [apiBlockQuery.data, listingRows, priceRangesQuery.data]);

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
    const siteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru';
    const city = apiBlockQuery.data?.region?.name ?? null;
    const block = apiBlockQuery.data as { addresses?: { address?: string | null }[] } | undefined;
    const text = complexSeoText({
      name: complex.name,
      city,
      priceFrom: complex.priceFrom,
      offerCount: complex.listingCount ?? null,
      description: complex.description,
      brand: shortName,
    });
    return {
      title: text.title,
      description: text.description,
      pathname: location.pathname,
      imageUrl: complex.images[0] ?? null,
      jsonLd: complexJsonLd({
        slug: complex.slug,
        name: complex.name,
        description: complex.description || null,
        address: block?.addresses?.[0]?.address ?? (complex.address && complex.address !== '—' ? complex.address : null),
        city,
        image: complex.images[0] ?? null,
        priceFrom: complex.priceFrom,
        priceTo: complex.priceTo,
        offerCount: complex.listingCount ?? null,
        lat: complex.hasCoords === false ? null : complex.coords?.[0] ?? null,
        lng: complex.hasCoords === false ? null : complex.coords?.[1] ?? null,
        siteUrl,
        brand: shortName,
      }),
    };
  }, [complex, apiBlockQuery.data, location.pathname, shortName]);
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
    complex.hasCoords !== false &&
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
    // Блок «О комплексе» есть почти всегда: в фактах хотя бы цена и срок сдачи
    if (complex) s.push({ id: 'description', label: 'О комплексе' });
    if (similarComplexes.length > 0) s.push({ id: 'similar', label: 'Похожие' });
    return s;
  }, [complex, hasApartments, hasChess, hasBuildings, hasLayouts, similarComplexes.length]);

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

  const availableCount = useMemo(() => {
    if (!complex) return 0;
    return (
      // Агрегат API по всему ЖК; по загруженной порции (первые 48) — только если агрегата нет
      complex.listingCount ||
      complex.buildings.reduce((s, b) => s + b.apartments.filter((a) => a.status === 'available').length, 0) ||
      0
    );
  }, [complex]);

  const complexFacts: [string, string][] = complex
    ? ([
        ['Адрес', complex.address?.trim()],
        ['Срок сдачи', complex.deadline?.trim()],
        ['Застройщик', hasDeveloper ? complex.builder.trim() : ''],
        ['Корпусов', buildings.length > 0 ? String(buildings.length) : ''],
        ['Цена', !isPriceHidden(complex.priceFrom) ? formatPriceRangeDisplay(complex.priceFrom, complex.priceTo) : ''],
      ] as [string, string | undefined][]).filter((row): row is [string, string] => Boolean(row[1] && row[1] !== '—'))
    : [];

  if (!complex) {
    if (slug && apiBlockQuery.isPending) {
      return (
        <div className="min-h-screen bg-background">
          <RedesignHeader mobileTabBar={false} />
          <ObjectPageSkeleton label="Загружаем комплекс" />
        </div>
      );
    }
    if (slug && apiBlockQuery.isError) {
      return (
        <div className="min-h-screen bg-background">
          <RedesignHeader mobileTabBar={false} />
          <PageLoadError onRetry={() => void apiBlockQuery.refetch()} retrying={apiBlockQuery.isFetching} />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background">
        <RedesignHeader mobileTabBar={false} />
        <PageNotFound title="Комплекс не найден" text="Возможно, ссылка устарела. Все жилые комплексы — в каталоге." />
      </div>
    );
  }

  const city = apiBlockQuery.data?.region?.name ?? null;
  const pickRooms = (rooms: number) => {
    setRoomFilter(roomCategoryFromRooms(rooms));
    scrollToSection('layouts');
  };
  const pageActions = [
    {
      key: 'fav',
      icon: <Heart className={cn('w-4 h-4', blockLiked && 'fill-destructive text-destructive')} />,
      label: blockLiked ? 'В избранном' : 'В избранное',
      disabled: blockNum == null,
      active: blockLiked,
      // Гостю избранное в localStorage — без входа (ТЗ v3, 4.1)
      onClick: () => {
        if (blockNum == null) return;
        void toggleBlock(blockNum);
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
  ];
  const priceFromText = formatPriceFrom(complex.priceFrom);

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-0">
      <RedesignHeader mobileTabBar={false} />

      <main id="main" className="max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 pb-10 pt-3 sm:pt-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 min-w-0 flex-wrap" aria-label="Хлебные крошки">
          <Link to="/" className="inline-flex min-h-8 shrink-0 items-center hover:text-foreground">Главная</Link>
          <span aria-hidden>/</span>
          <Link
            to={regionId ? buildCatalogFilterUrl(regionId) : '/catalog'}
            className="inline-flex min-h-8 shrink-0 items-center hover:text-foreground"
          >
            Новостройки{city ? ` ${city === 'Анапа' ? 'Анапы' : city === 'Майкоп' ? 'Майкопа' : city === 'Краснодар' ? 'Краснодара' : city === 'Новороссийск' ? 'Новороссийска' : city}` : ''}
          </Link>
          {districtCatalogUrl ? (
            <>
              <span aria-hidden>/</span>
              <Link to={districtCatalogUrl} className="inline-flex min-h-8 items-center truncate max-w-[140px] hover:text-foreground sm:max-w-none">{complex.district}</Link>
            </>
          ) : null}
          <span aria-hidden>/</span>
          <span className="text-foreground font-medium truncate">{complex.name}</span>
        </nav>

        {/* Первый экран: галерея + карточка с главным. Раньше — шапка, галерея на всю ширину и колонка 272 px до конца страницы */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <ComplexPremiumGallery images={complex.images} title={complex.name} />
          </div>
          <ComplexSummaryCard
            complex={complex}
            availableCount={availableCount}
            city={city}
            actions={pageActions}
            onConsultation={() => openComplexConsult(`complex:${complex.slug}:summary`)}
            onRoomPick={hasApartments ? pickRooms : undefined}
          />
        </div>

        <div className="mt-6">
          <ComplexAnchorNav
            sections={navSections}
            activeId={activeSection || navSections[0]?.id || ''}
            onNavigate={scrollToSection}
            aside={
              <>
                <span className="text-[15px] font-bold tabular-nums">{priceFromText}</span>
                <Button variant="primary" size="sm" type="button" onClick={() => openComplexConsult(`complex:${complex.slug}:nav`)}>
                  {CONVERSION_CTA.viewing}
                </Button>
              </>
            }
          />
        </div>

        <div className="space-y-12 sm:space-y-14">
          {hasBuildings || hasApartments || hasLayouts ? (
            <Reveal as="section" id="layouts" className="scroll-mt-36">
              {sectionHeading('Квартиры', listingsTotal > 0 ? `${listingsTotal.toLocaleString('ru-RU')} в продаже` : undefined)}
              {listingsQuery.isError && listingRows.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
                  Не удалось загрузить квартиры.
                  <Button variant="secondary" size="sm" type="button" onClick={() => void listingsQuery.refetch()}>
                    Повторить
                  </Button>
                </div>
              ) : listingsQuery.isPending ? (
                <div className="space-y-2" aria-label="Загрузка квартир">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-xl bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : hasApartments ? (
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
                  {listingsQuery.hasNextPage ? (
                    <div className="flex justify-center pt-1">
                      <Button
                        variant="secondary"
                        type="button"
                        className="h-auto min-h-11 w-full whitespace-normal py-2 sm:w-auto"
                        disabled={listingsQuery.isFetchingNextPage}
                        onClick={() => void listingsQuery.fetchNextPage()}
                      >
                        {listingsQuery.isFetchingNextPage
                          ? 'Загружаем…'
                          : `Показать ещё · загружено ${listingRows.length.toLocaleString('ru-RU')} из ${listingsTotal.toLocaleString('ru-RU')}`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
                  Свободных квартир пока нет
                </div>
              )}
            </Reveal>
          ) : null}

          {hasChess && fromApi ? (
            <section ref={chessboardSectionRef} id="chessboard" className="scroll-mt-36">
              {sectionHeading('Шахматка', activeBuilding?.name || 'Квартиры по этажам')}
              {!chessboardEnabled ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Загрузим шахматку, когда вы до неё доберётесь
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
                <div className="h-64 rounded-xl border border-border bg-muted/30 animate-pulse" aria-label="Загрузка шахматки" />
              ) : null}
            </section>
          ) : null}

          {hasLayouts ? (
            <Reveal as="section" id="plans" className="scroll-mt-36">
              {sectionHeading('Планировки', `${layouts.length} типов`)}
              <LayoutGrid layouts={layouts} complexSlug={complex.slug} />
            </Reveal>
          ) : null}

          {hasDescription || hasInfra || hasMap || hasDeveloper || complexFacts.length > 0 ? (
            <Reveal as="section" id="description" className="scroll-mt-36">
              {sectionHeading('О комплексе')}
              <div className={cn('grid gap-4', hasMap && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
                <div className="space-y-5 rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
                  {complexFacts.length > 0 || hasDeveloper ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                      {hasDeveloper ? (
                        <div className="space-y-0.5">
                          <dt className="text-[13px] text-muted-foreground">Застройщик</dt>
                          <dd className="text-[15px] font-medium">{complex.builder}</dd>
                        </div>
                      ) : null}
                      {complexFacts.map(([label, value]) => (
                        <div key={label} className="space-y-0.5">
                          <dt className="text-[13px] text-muted-foreground">{label}</dt>
                          <dd className="text-[15px] font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {hasDescription ? (
                    complex.description.includes('<') ? (
                      <div
                        className="text-[15px] text-muted-foreground leading-relaxed prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(complex.description, { USE_PROFILES: { html: true } }) }}
                      />
                    ) : (
                      <p className="text-[15px] text-muted-foreground leading-relaxed whitespace-pre-line">{complex.description}</p>
                    )
                  ) : null}
                  {hasInfra ? (
                    <ul className="flex flex-wrap gap-2 text-sm">
                      {complex.infrastructure.map((item, i) => (
                        <li key={i} className="rounded-full bg-muted/60 px-3 py-1.5 text-foreground/80">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {hasMap ? (
                  <div id="map" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-[13px] text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{complex.address}</span>
                    </div>
                    <div ref={mapRef} className="h-[300px] bg-muted lg:h-[calc(100%-41px)] lg:min-h-[300px]" />
                  </div>
                ) : null}
              </div>
            </Reveal>
          ) : null}

          {/* Заявка — одной полосой, а не блоком на 800 px */}
          <Reveal as="section" id="lead" className="scroll-mt-36">
            <div className="grid gap-6 overflow-hidden rounded-2xl bg-brand-soft p-5 ring-1 ring-primary/15 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-center lg:gap-10">
              <div>
                <h2 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">Подберём квартиру в «{complex.name}»</h2>
                <p className="mt-2 max-w-md text-[15px] text-muted-foreground">
                  Расскажем о свободных квартирах и условиях покупки, запишем на просмотр. Консультация бесплатная.
                </p>
              </div>
              <div className="rounded-xl bg-card p-4 shadow-card sm:p-5">
                <LeadForm
                  title=""
                  embedded
                  source={`ЖК: ${complex.slug}`}
                  blockId={fromApi && apiBlockQuery.data ? apiBlockQuery.data.id : undefined}
                  requestType="CONSULTATION"
                />
              </div>
            </div>
          </Reveal>

          {similarComplexes.length > 0 ? (
            <Reveal as="section" id="similar" className="scroll-mt-36">
              {sectionHeading('Похожие жилые комплексы')}
              {/* Телефон: лента со свайпом; десктоп: ровная сетка */}
              <SnapRail label="Похожие жилые комплексы" desktopCols={3} wideCols={4} className="sm:-mx-4 lg:mx-0">
                {/* Ровно один ряд из 4 на десктопе — пятая карточка висела одна */}
                {similarComplexes.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex h-full min-h-0">
                    <ComplexCard complex={c} />
                  </div>
                ))}
              </SnapRail>
            </Reveal>
          ) : null}
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm px-3 py-2.5 lg:hidden safe-area-pb">
        <div className="flex items-center gap-3 max-w-[1400px] mx-auto">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-bold tabular-nums">{priceFromText}</p>
            {availableCount > 0 ? (
              <p className="truncate text-[12px] text-muted-foreground">{availableCount.toLocaleString('ru-RU')} {flatsWord(availableCount)}</p>
            ) : null}
          </div>
          <Button
            variant="primary"
            className="shrink-0 px-5"
            type="button"
            onClick={() => openComplexConsult(`complex:${complex.slug}:sticky`)}
          >
            {/* На 320 px полная подпись не помещалась рядом с ценой */}
            <span className="min-[360px]:hidden">Записаться</span>
            <span className="hidden min-[360px]:inline">{CONVERSION_CTA.viewing}</span>
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
