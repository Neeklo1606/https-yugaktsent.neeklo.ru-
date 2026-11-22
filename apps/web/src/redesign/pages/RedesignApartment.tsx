import { formatArea } from '@/redesign/lib/listing-format';
import { useParams, Link, useLocation, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Heart,
  Share2,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import LeadForm from '@/shared/components/LeadForm';
import ConversionCTABar from '@/redesign/components/ConversionCTABar';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import ConversionDebugOverlay from '@/redesign/components/ConversionDebugOverlay';
import { CONVERSION_CTA, type ConsultationContext } from '@/redesign/lib/conversion-cta';
import { prefersReducedMotion } from '@/redesign/lib/map-sidebar-scroll-utils';
import ApartmentMediaGallery from '@/redesign/components/ApartmentMediaGallery';
import ApartmentPriceTrust from '@/redesign/components/ApartmentPriceTrust';
import ApartmentCharacteristics from '@/redesign/components/ApartmentCharacteristics';
import ComplexAnchorNav, { type ComplexSection } from '@/redesign/components/ComplexAnchorNav';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import { apiGet } from '@/lib/api';
import { mapListingRowToApartment, type ApiListingRow } from '@/redesign/lib/blocks-from-api';
import { mapListingDetailToApartmentPage, type ApiListingDetail } from '@/redesign/lib/listing-page-from-api';
import { formatDisplayPrice } from '@/redesign/lib/display-price';
import { cn } from '@/lib/utils';
import { useFavorites } from '@/shared/hooks/useFavorites';
import { shareCurrentPage } from '@/lib/share-page';
import { useEntitySeoMeta, useNoIndex } from '@/shared/hooks/useEntitySeoMeta';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { useInViewOnce } from '@/shared/hooks/useInViewOnce';
import { buildCatalogFilterUrl } from '@/redesign/lib/catalog-filter-links';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import Reveal from '@/shared/components/Reveal';
import { apartmentSeo } from '@/shared/seo/structured-seo';

const SEO_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru';
import RelatedListingsCarousel from '@/discovery/components/RelatedListingsCarousel';
import CompareSessionChip from '@/shared/components/CompareSessionChip';
import { recordBrowseHistory } from '@/shared/lib/record-browse-history';
import { listingHref } from '@/shared/lib/browse-history-local';

function parseNumericListingId(id: string | undefined): number | null {
  if (!id) return null;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n) || String(n) !== id) return null;
  return n;
}

declare global {
  interface Window { ymaps: any; }
}

function isValidImageSrc(src?: string | null): src is string {
  return Boolean(src && !src.endsWith('/placeholder.svg'));
}

function sectionHeading(title: string, subtitle?: string) {
  return (
    <div className="mb-4">
      <h2 className="text-lg sm:text-xl font-bold">{title}</h2>
      {subtitle ? <p className="text-sm text-muted-foreground mt-1">{subtitle}</p> : null}
    </div>
  );
}

const RedesignApartment = () => {
  const { id: idParam } = useParams<{ id: string }>();
  const location = useLocation();
  const { isListingFavorite, toggleListing } = useFavorites();
  const { data: defaultRegionId } = useDefaultRegionId();
  const { shortName } = useSiteBrand();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInView = useInViewOnce(mapRef);
  const { ready: ymapsReady } = useYandexMapsReady({ enabled: mapInView });
  const mapInstanceRef = useRef<any>(null);
  const mapInitializedRef = useRef(false);
  const [activeSection, setActiveSection] = useState('');
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultContext, setConsultContext] = useState<ConsultationContext | null>(null);
  const listingId = parseNumericListingId(idParam);

  /** Объекты живут только в API: выдуманных подстановок больше нет. */
  const mockResult = null;

  const listingQuery = useQuery({
    queryKey: ['listing', 'detail', listingId],
    queryFn: () => apiGet<ApiListingDetail>(`/listings/${listingId}`),
    enabled: listingId != null,
    retry: false,
  });

  const apiPage = useMemo(() => {
    if (!listingQuery.data) return null;
    return mapListingDetailToApartmentPage(listingQuery.data);
  }, [listingQuery.data]);

  const blockId = listingQuery.data?.blockId ?? listingQuery.data?.block?.id ?? null;

  const similarApiQuery = useQuery({
    queryKey: ['listings', 'similar-apartments', blockId, listingId, apiPage?.apartment.rooms],
    queryFn: () =>
      apiGet<{ data: ApiListingRow[] }>(
        // Фильтр по комнатности на сервере: раньше брали первые 40 квартир ЖК и среди них часто не было той же комнатности
        `/listings?block_id=${blockId}&kind=APARTMENT&status=ACTIVE&per_page=12&sort=price_asc&rooms=${apiPage?.apartment.rooms ?? ''}`,
      ),
    enabled: Boolean(apiPage && blockId != null && listingId != null),
    select: (res) => {
      if (blockId == null || listingId == null) return [];
      const rooms = apiPage?.apartment.rooms;
      if (rooms === undefined) return [];
      return res.data
        .filter((l) => l.id !== listingId)
        .map((l) => mapListingRowToApartment(l, String(blockId), String(l.buildingId ?? `${blockId}-main`)))
        .filter((a): a is NonNullable<typeof a> => a != null)
        .filter((a) => a.rooms === rooms && a.status === 'available')
        .slice(0, 4);
    },
  });

  const apt = mockResult?.apartment ?? apiPage?.apartment;
  const complex = mockResult?.complex ?? apiPage?.complex;
  const building = mockResult?.building ?? apiPage?.building;

  const mediaImages = useMemo(() => {
    const fromListing =
      listingQuery.data && Array.isArray((listingQuery.data as ApiListingDetail & { mediaFiles?: { url?: string }[] }).mediaFiles)
        ? ((listingQuery.data as ApiListingDetail & { mediaFiles?: { url?: string | null }[] }).mediaFiles ?? [])
            .map((file) => file.url)
            .filter((url): url is string => isValidImageSrc(url))
        : [];
    const fromApartment = apt?.galleryImages?.filter(isValidImageSrc) ?? [];
    return Array.from(new Set([...fromApartment, ...fromListing]));
  }, [apt?.galleryImages, listingQuery.data]);

  const entitySeo = useMemo(() => {
    if (!apt) return null;
    const detail = listingQuery.data as (ApiListingDetail & { region?: { name?: string | null } | null; block?: { name?: string | null; slug?: string | null } | null; building?: { name?: string | null } | null; apartment?: { buildingName?: string | null } | null }) | undefined;
    const path = listingId != null ? `/apartment/${listingId}` : location.pathname;
    const seo = apartmentSeo({
      id: listingId ?? apt.id,
      rooms: Number.isFinite(apt.rooms) ? apt.rooms : null,
      area: apt.area || null,
      floor: apt.floor || null,
      floorsTotal: apt.totalFloors || null,
      price: apt.price || null,
      complexName: complex?.name ?? detail?.block?.name ?? null,
      complexSlug: detail?.block?.slug ?? complex?.slug ?? null,
      // Порядок как в scripts/prerender-seo.mjs — title в HTML и после загрузки совпадает
      building: detail?.apartment?.buildingName || detail?.building?.name || apt.buildingName || null,
      city: detail?.region?.name ?? null,
      image: mediaImages[0] ?? (isValidImageSrc(apt.planImage) ? apt.planImage : null),
      siteUrl: SEO_SITE_URL,
      brand: shortName,
    });
    return {
      title: seo.title,
      description: seo.description,
      pathname: path,
      imageUrl: mediaImages[0] ?? null,
      jsonLd: seo.jsonLd,
    };
  }, [apt, complex, listingId, listingQuery.data, location.pathname, mediaImages, shortName]);
  useEntitySeoMeta(entitySeo);

  const similarApts = useMemo(() => {
    if (mockResult?.complex && mockResult.apartment) {
      return mockResult.complex.buildings
        .flatMap((b) => b.apartments)
        .filter(
          (a) =>
            a.id !== mockResult.apartment!.id &&
            a.status === 'available' &&
            a.rooms === mockResult.apartment!.rooms,
        )
        .slice(0, 4);
    }
    return similarApiQuery.data ?? [];
  }, [mockResult, similarApiQuery.data]);

  const loading = listingId != null && listingQuery.isPending;
  const apiFailed = listingId != null && (listingQuery.isError || (listingQuery.isFetched && !apiPage));
  useNoIndex(apiFailed);

  const fetchedKind = listingQuery.data?.kind;
  const fetchedHasBlock = !!listingQuery.data?.block;

  const navSections = useMemo((): ComplexSection[] => {
    if (!apt) return [];
    const s: ComplexSection[] = [
      { id: 'gallery', label: 'Планировка' },
      { id: 'characteristics', label: 'Характеристики' },
      { id: 'description', label: 'Описание' },
    ];
    if (similarApts.length > 0) s.push({ id: 'similar', label: 'Похожие' });
    s.push({ id: 'lead', label: 'Заявка' });
    return s;
  }, [apt, similarApts.length]);

  const initMap = useCallback(() => {
    if (!ymapsReady || !complex || mapInstanceRef.current || !mapRef.current || !window.ymaps) return;
    window.ymaps.ready(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, {
        center: complex.coords,
        zoom: 15,
        controls: ['zoomControl'],
      });
      map.geoObjects.add(
        new window.ymaps.Placemark(
          complex.coords,
          {
            balloonContentHeader: `<strong>${complex.name}</strong>`,
            balloonContentBody: `<div>${complex.address}</div>`,
          },
          { preset: 'islands#blueCircleDotIcon' },
        ),
      );
      mapInstanceRef.current = map;
      mapInitializedRef.current = true;
    });
  }, [ymapsReady, complex]);

  const scrollToSection = useCallback(
    (id: string) => {
      setActiveSection(id);
      document.getElementById(id)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      if (id === 'map') window.setTimeout(() => initMap(), 150);
    },
    [initMap],
  );

  useEffect(() => {
    if (!navSections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    );
    navSections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [navSections, apt?.id]);

  useEffect(() => {
    if (!complex) return;
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
  }, [complex, initMap]);

  useEffect(() => {
    if (listingId == null || !apt || !complex) return;
    const title = `${complex.name} · ${formatArea(apt.area)}`;
    void recordBrowseHistory(
      'LISTING',
      listingId,
      title,
      listingHref(listingId, 'APARTMENT', complex.slug),
    );
  }, [listingId, apt?.id, apt?.area, complex?.name, complex?.slug]);

  useEffect(() => {
    mapInstanceRef.current?.destroy?.();
    mapInstanceRef.current = null;
    mapInitializedRef.current = false;
  }, [complex?.coords[0], complex?.coords[1]]);

  const shouldRedirectToListing =
    listingId != null &&
    listingQuery.isFetched &&
    listingQuery.data &&
    (fetchedKind !== 'APARTMENT' || !fetchedHasBlock);

  if (shouldRedirectToListing) {
    return <Navigate to={`/listing/${listingId}`} replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <RedesignHeader mobileTabBar={false} />
        <div className="max-w-[1400px] mx-auto px-4 py-16 text-center text-muted-foreground text-sm">Загрузка…</div>
      </div>
    );
  }

  if (apiFailed || !apt || !complex || !building) {
    return (
      <div className="min-h-screen bg-background">
        <RedesignHeader mobileTabBar={false} />
        <div className="max-w-[1400px] mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Квартира не найдена</p>
          <Link to="/catalog" className="text-primary text-sm mt-2 inline-block">
            ← Каталог
          </Link>
        </div>
      </div>
    );
  }

  const roomLabel = apt.rooms === 0 ? 'Студия' : `${apt.rooms}-комнатная`;
  /** Без настоящих координат ЖК карту рисовать нечем — прячем и кнопку, и саму карту */
  const hasCoords = complex.hasCoords === true;
  const hasAddress = Boolean(complex.address?.trim() && complex.address !== '—');
  const isSold = apt.status === 'sold';
  const isReserved = apt.status === 'reserved';

  const listingLiked = listingId != null && isListingFavorite(listingId);

  const handleListingFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (listingId == null) return;
    // Гостю — в localStorage, без входа (ТЗ v3, 4.1)
    void toggleListing(listingId);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    void shareCurrentPage({ title: `${complex.name} · ${roomLabel}` });
  };

  const baseConsultContext: ConsultationContext = {
    surface: 'apartment',
    source: `apartment:${apt.id}`,
    blockId: blockId ?? undefined,
    listingId: listingId ?? undefined,
    sold: isSold,
    requestType: isSold ? 'CONSULTATION' : 'CONSULTATION',
    contextFooter: `${roomLabel}, ${formatArea(apt.area)} · ${complex.name}`,
  };

  const regionId = defaultRegionId ?? null;
  const districtCatalogUrl =
    regionId && complex.district && complex.district !== '—'
      ? buildCatalogFilterUrl(regionId, { district: complex.district })
      : null;
  const catalogUrl = regionId ? buildCatalogFilterUrl(regionId) : '/catalog';

  const openConsultation = (ctx: ConsultationContext) => {
    setConsultContext(ctx);
    setConsultOpen(true);
  };


  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <RedesignHeader mobileTabBar={false} />

      <main id="main" className="max-w-[1400px] mx-auto px-4 py-4 sm:py-6">
        <nav aria-label="Хлебные крошки" className="mb-4 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-muted-foreground sm:text-sm">
          <Link to="/" className="inline-flex min-h-8 items-center hover:text-foreground">Главная</Link>
          <span>/</span>
          <Link to={catalogUrl} className="inline-flex min-h-8 items-center hover:text-foreground">Каталог</Link>
          {districtCatalogUrl ? (
            <>
              <span className="hidden sm:inline">/</span>
              <Link to={districtCatalogUrl} className="hidden min-h-8 items-center truncate hover:text-foreground sm:inline-flex">
                {complex.district}
              </Link>
            </>
          ) : null}
          <span>/</span>
          <Link to={`/complex/${complex.slug}`} className="inline-flex min-h-8 items-center truncate max-w-[140px] hover:text-foreground sm:max-w-none">
            {complex.name}
          </Link>
          {/* Текущая страница — в заголовке карточки; на телефоне крошки в одну строку */}
          <span className="hidden sm:inline">/</span>
          <span className="hidden truncate font-medium text-foreground sm:inline">
            {roomLabel}, {formatArea(apt.area)}
          </span>
        </nav>

        {isSold || isReserved ? (
          <div
            className={cn(
              'mb-4 rounded-xl border px-4 py-3 text-sm',
              isSold ? 'border-muted bg-muted/40 text-muted-foreground' : 'border-warning/30 bg-warning-soft text-warning',
            )}
          >
            {isSold
              ? 'Эта квартира продана. Вы можете посмотреть похожие предложения ниже.'
              : 'Квартира в брони. Оставьте заявку, и менеджер уточнит актуальность.'}
          </div>
        ) : null}

        {/* Первый экран как у ЖК: планировка слева, всё для решения — в карточке справа */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 lg:h-full">
            <ApartmentMediaGallery
              planSrc={apt.planImage}
              finishingSrc={apt.finishingImage}
              gallerySrcs={mediaImages}
              title={`${roomLabel}, ${formatArea(apt.area)}`}
            />
          </div>
          <ApartmentPriceTrust
            apartment={apt}
            complexName={complex.name}
            complexSlug={complex.slug}
            buildingName={building.name}
            address={complex.address}
            roomLabel={roomLabel}
            deadline={building.deadline}
            actions={[
              {
                key: 'fav',
                icon: <Heart className={cn('w-4 h-4', listingLiked && 'fill-destructive text-destructive')} />,
                label: listingLiked ? 'В избранном' : 'В избранное',
                disabled: listingId == null,
                active: listingLiked,
                onClick: handleListingFavorite as unknown as () => void,
              },
              {
                key: 'pdf',
                icon: <FileText className="w-4 h-4" />,
                label: 'Презентация PDF',
                href: listingId != null ? `/presentation/listing/${listingId}` : `/presentation/${complex.slug}`,
              },
              {
                key: 'share',
                icon: <Share2 className="w-4 h-4" />,
                label: 'Поделиться',
                onClick: handleShare as unknown as () => void,
              },
            ]}
            cta={
              <ConversionCTABar
                layout="stack"
                context={baseConsultContext}
                onConsultation={openConsultation}
                consultationLabel={isSold ? CONVERSION_CTA.consultation : CONVERSION_CTA.viewing}
              />
            }
          />
        </div>

        <div className="mt-6 mb-8">
          <ComplexAnchorNav
            sections={navSections}
            activeId={activeSection || navSections[0]?.id || ''}
            onNavigate={scrollToSection}
            aside={
              <>
                <span className="text-[15px] font-bold tabular-nums">{formatDisplayPrice(apt.price)}</span>
                <Button variant="primary" size="sm" type="button" onClick={() => openConsultation({ ...baseConsultContext, source: `apartment:${apt.id}:nav` })}>
                  {isSold ? CONVERSION_CTA.consultation : CONVERSION_CTA.viewing}
                </Button>
              </>
            }
          />
        </div>

        <div className="space-y-12 sm:space-y-14">
          <Reveal>
            <ApartmentCharacteristics
              apartment={apt}
              building={building}
              complex={complex}
              roomLabel={roomLabel}
            />
          </Reveal>

          {/* Описание и карта рядом — как «О комплексе» на странице ЖК */}
          <Reveal as="section" id="description" className="scroll-mt-36">
            {sectionHeading(hasCoords ? 'О квартире и расположение' : 'О квартире')}
            <div className={cn('grid gap-4', hasCoords && 'lg:grid-cols-2')}>
              <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {roomLabel} площадью {formatArea(apt.area)}
                  {apt.floor > 0 ? ` на ${apt.floor} этаже${apt.totalFloors > apt.floor ? ` ${apt.totalFloors}-этажного дома` : ''}` : ''} в ЖК «{complex.name}».
                  {apt.finishing !== 'без отделки' ? ` Отделка: ${apt.finishing}.` : ' Без отделки.'}
                  {apt.kitchenArea > 0 ? ` Кухня ${formatArea(apt.kitchenArea)}.` : ''}
                </p>
                {complex.description?.trim() && complex.description !== `Жилой комплекс «${complex.name}».` ? (
                  <p className="mt-4 border-t border-border pt-4 text-[15px] leading-relaxed text-muted-foreground">
                    {complex.description.replace(/<[^>]+>/g, '').slice(0, 800)}
                    {complex.description.length > 800 ? '…' : ''}
                  </p>
                ) : null}
                {hasAddress && !hasCoords ? (
                  <p id="map" className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{complex.address}</span>
                  </p>
                ) : null}
                <Link
                  to={`/complex/${complex.slug}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Все квартиры в ЖК «{complex.name}» →
                </Link>
              </div>
              {/* Без координат карту рисовать нечем — адрес остаётся строкой в описании (ТЗ v3, 4.6) */}
              {hasCoords ? (
                <div id="map" className="scroll-mt-36 flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
                  {hasAddress ? (
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 text-sm">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{complex.address}</span>
                    </div>
                  ) : null}
                  <div ref={mapRef} className="min-h-[260px] flex-1 bg-muted" />
                </div>
              ) : null}
            </div>
          </Reveal>

          {similarApts.length > 0 ? (
            <Reveal as="section" id="similar" className="scroll-mt-36">
              {sectionHeading(`Похожие квартиры в ЖК «${complex.name}»`)}
              {/* Телефон: лента со свайпом (две карточки в кадре); с планшета — ровная сетка */}
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&>*]:w-[64%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
                {similarApts.map((a) => (
                  <Link
                    key={a.id}
                    to={`/apartment/${a.id}`}
                    className="group overflow-hidden rounded-2xl border border-border/70 bg-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card"
                  >
                    <StableMediaFrame
                      src={a.planImage}
                      altContext={`${a.rooms === 0 ? 'Студия' : `${a.rooms}-комн`}, ${formatArea(a.area)}`}
                      aspect="4/3"
                      fallback="branded"
                      loading="lazy"
                      imgClassName="object-contain p-4 opacity-90 transition-opacity group-hover:opacity-100"
                    />
                    <div className="space-y-1 border-t border-border p-3.5">
                      <p className="text-[16px] font-bold tabular-nums">{formatDisplayPrice(a.price)}</p>
                      <h3 className="text-[14px] font-medium">
                        {a.rooms === 0 ? 'Студия' : `${a.rooms}-комн.`}, {formatArea(a.area)}
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        {a.floor > 0 ? `${a.floor} этаж` : ''}
                        {a.floor > 0 && a.finishing ? ' · ' : ''}
                        {a.finishing}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </Reveal>
          ) : null}

          {listingId != null ? (
            <RelatedListingsCarousel
              title="Похожие по цене"
              fetchUrl={`/discovery/listings/${listingId}/price-neighbors?limit=8`}
              queryKey={['discovery', 'price-neighbors', listingId]}
              excludeId={listingId}
              className="scroll-mt-28"
            />
          ) : null}

          <Reveal as="section" id="lead" className="scroll-mt-36">
            <div className="grid gap-6 rounded-2xl bg-brand-soft p-5 ring-1 ring-primary/15 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-center lg:gap-10">
              <div>
                <h2 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
                  {isSold ? 'Подберём похожую квартиру' : 'Запишем на просмотр'}
                </h2>
                <p className="mt-2 max-w-md text-[15px] text-muted-foreground">
                  {isSold
                    ? 'Эта квартира продана — расскажем о похожих в этом и соседних ЖК.'
                    : `${roomLabel}, ${formatArea(apt.area)} в «${complex.name}»: уточним цену, условия покупки и покажем квартиру.`}
                </p>
              </div>
              <div className="rounded-xl bg-card p-4 shadow-card sm:p-5">
                <LeadForm
                  title=""
                  embedded
                  source={`Квартира: ${apt.id}`}
                  blockId={blockId ?? undefined}
                  listingId={listingId ?? undefined}
                  requestType="CONSULTATION"
                  contextFooter={
                    isSold
                      ? `Запрос по проданной квартире ${roomLabel}, ${formatArea(apt.area)} · ${complex.name}`
                      : undefined
                  }
                />
              </div>
            </div>
          </Reveal>
        </div>
      </main>

      {/* Один липкий слой снизу: панель действий вместо нижнего меню (ТЗ v3, 4.1) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden">
        <ConversionCTABar
          layout="bar"
          context={baseConsultContext}
          onConsultation={openConsultation}
          consultationLabel={isSold ? CONVERSION_CTA.consultation : CONVERSION_CTA.viewing}
        />
      </div>

      <ConsultationFlow
        open={consultOpen}
        onOpenChange={setConsultOpen}
        context={consultContext}
      />
      <ConversionDebugOverlay />

      <CompareSessionChip />

      <FooterSection />
    </div>
  );
};

export default RedesignApartment;
