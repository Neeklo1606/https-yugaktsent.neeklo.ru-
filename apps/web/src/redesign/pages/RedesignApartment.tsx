import { useParams, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Building2,
  Heart,
  Share2,
  GitCompare,
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
import ObjectPageActionBar from '@/redesign/components/ObjectPageActionBar';
import ApartmentPriceTrust from '@/redesign/components/ApartmentPriceTrust';
import ApartmentCharacteristics from '@/redesign/components/ApartmentCharacteristics';
import ComplexAnchorNav, { type ComplexSection } from '@/redesign/components/ComplexAnchorNav';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import { apiGet } from '@/lib/api';
import { mapListingRowToApartment, type ApiListingRow } from '@/redesign/lib/blocks-from-api';
import { mapListingDetailToApartmentPage, type ApiListingDetail } from '@/redesign/lib/listing-page-from-api';
import { formatDisplayPrice } from '@/redesign/lib/display-price';
import { cn } from '@/lib/utils';
import { useAuth } from '@/shared/hooks/useAuth';
import { useFavorites } from '@/shared/hooks/useFavorites';
import { useCompare } from '@/shared/hooks/useCompare';
import { shareCurrentPage } from '@/lib/share-page';
import { useEntitySeoMeta } from '@/shared/hooks/useEntitySeoMeta';
import { toast } from '@/components/ui/sonner';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { useInViewOnce } from '@/shared/hooks/useInViewOnce';
import { buildCatalogFilterUrl } from '@/redesign/lib/catalog-filter-links';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import RelatedListingsCarousel from '@/discovery/components/RelatedListingsCarousel';
import SessionDiscoverySection from '@/redesign/components/SessionDiscoverySection';
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
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isListingFavorite, toggleListing } = useFavorites();
  const { isCompared, toggle: toggleCompare, count: compareCount } = useCompare();
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
        `/listings?block_id=${blockId}&kind=APARTMENT&status=ACTIVE&per_page=40`,
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
    const roomsLabel =
      apt.rooms == null ? 'Квартира' : apt.rooms === 0 ? 'Студия' : `${apt.rooms}-комн.`;
    const priceLabel = formatDisplayPrice(apt.price);
    const title = [apt.area ? `${roomsLabel}, ${apt.area} м²` : roomsLabel, complex?.name]
      .filter(Boolean)
      .join(' · ');
    const description = [priceLabel, complex?.name, apt.area ? `${apt.area} м²` : '']
      .filter(Boolean)
      .join(' · ')
      .slice(0, 160);
    const path = listingId != null ? `/apartment/${listingId}` : location.pathname;
    return {
      title: title || 'Квартира',
      description: description || `Карточка квартиры на ${shortName}`,
      pathname: path,
      imageUrl: mediaImages[0] ?? null,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Apartment',
        name: title,
        url: `${window.location.origin}${path}`,
        ...(priceLabel ? { offers: { '@type': 'Offer', price: apt.price, priceCurrency: 'RUB' } } : {}),
        ...(apt.area ? { floorSize: { '@type': 'QuantitativeValue', value: apt.area, unitCode: 'MTK' } } : {}),
      },
    };
  }, [apt, complex, listingId, location.pathname, mediaImages, shortName]);
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

  const fetchedKind = listingQuery.data?.kind;
  const fetchedHasBlock = !!listingQuery.data?.block;

  const navSections = useMemo((): ComplexSection[] => {
    if (!apt) return [];
    const s: ComplexSection[] = [
      { id: 'gallery', label: 'Медиа' },
      { id: 'price', label: 'Цена' },
      { id: 'characteristics', label: 'Характеристики' },
      { id: 'description', label: 'Описание' },
    ];
    s.push({ id: 'map', label: 'Карта' });
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
    const title = `${complex.name} · ${apt.area} м²`;
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
        <RedesignHeader />
        <div className="max-w-[1400px] mx-auto px-4 py-16 text-center text-muted-foreground text-sm">Загрузка…</div>
      </div>
    );
  }

  if (apiFailed || !apt || !complex || !building) {
    return (
      <div className="min-h-screen bg-background">
        <RedesignHeader />
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
  const isSold = apt.status === 'sold';
  const isReserved = apt.status === 'reserved';

  const listingLiked = listingId != null && isListingFavorite(listingId);
  const listingCompareKey = listingId != null ? `l:${listingId}` : complex.slug;
  const inCompare = isCompared(listingCompareKey);

  const handleListingFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (listingId == null) return;
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }
    void toggleListing(listingId);
  };

  const handleCompare = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!inCompare && compareCount >= 3) {
      toast.error('В сравнении не более 3 объектов');
      return;
    }
    toggleCompare(listingCompareKey);
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
    contextFooter: `${roomLabel}, ${apt.area} м² · ${complex.name}`,
  };

  const regionId = defaultRegionId ?? null;
  const districtCatalogUrl =
    regionId && complex.district && complex.district !== '—'
      ? buildCatalogFilterUrl(regionId, { district: complex.district })
      : null;
  const subwayCatalogUrl =
    regionId && complex.subway && complex.subway !== '—'
      ? buildCatalogFilterUrl(regionId, { subway: complex.subway })
      : null;
  const catalogUrl = regionId ? buildCatalogFilterUrl(regionId) : '/catalog';

  const openConsultation = (ctx: ConsultationContext) => {
    setConsultContext(ctx);
    setConsultOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-32 lg:pb-8">
      <RedesignHeader />

      <div className="max-w-[1400px] mx-auto px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <nav className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground min-w-0 flex-wrap">
            <Link to="/" className="inline-flex min-h-8 items-center hover:text-foreground">Главная</Link>
            <span>/</span>
            <Link to={catalogUrl} className="inline-flex min-h-8 items-center hover:text-foreground">Каталог</Link>
            {districtCatalogUrl ? (
              <>
                <span>/</span>
                <Link to={districtCatalogUrl} className="inline-flex min-h-8 items-center truncate max-w-[100px] hover:text-foreground sm:max-w-none">
                  {complex.district}
                </Link>
              </>
            ) : null}
            <span>/</span>
            <Link to={`/complex/${complex.slug}`} className="inline-flex min-h-8 items-center truncate max-w-[140px] hover:text-foreground sm:max-w-none">
              {complex.name}
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium truncate">
              {roomLabel}, {apt.area} м²
            </span>
          </nav>
          <ObjectPageActionBar
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
                key: 'compare',
                icon: <GitCompare className="w-4 h-4" />,
                label: inCompare ? 'В сравнении' : 'Сравнить',
                active: inCompare,
                onClick: handleCompare as unknown as () => void,
              },
              {
                key: 'pdf',
                icon: <FileText className="w-4 h-4" />,
                label: 'Презентация',
                href: listingId != null ? `/presentation/listing/${listingId}` : `/presentation/${complex.slug}`,
              },
              {
                key: 'share',
                icon: <Share2 className="w-4 h-4" />,
                label: 'Поделиться',
                onClick: handleShare as unknown as () => void,
              },
            ]}
          />
        </div>

        <div className="mb-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
            {roomLabel}, {apt.area} м²
          </h1>
          <Link to={`/complex/${complex.slug}`} className="text-xs text-muted-foreground hover:text-primary mt-1 inline-block">
            {complex.name}
          </Link>
        </div>

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

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_min(40%,340px)] lg:gap-8 xl:gap-10 lg:items-start">
          <div className="min-w-0">
            <ApartmentMediaGallery
              planSrc={apt.planImage}
              finishingSrc={apt.finishingImage}
              gallerySrcs={mediaImages}
              title={`${roomLabel}, ${apt.area} м²`}
            />

            <ComplexAnchorNav
              sections={navSections}
              activeId={activeSection || navSections[0]?.id || ''}
              onNavigate={scrollToSection}
            />

            <div className="lg:hidden mt-4 space-y-4">
              <ApartmentPriceTrust
                apartment={apt}
                complexName={complex.name}
                complexSlug={complex.slug}
                buildingName={building.name}
                address={complex.address}
                roomLabel={roomLabel}
              />
              <ConversionCTABar
                layout="stack"
                context={baseConsultContext}
                onConsultation={openConsultation}
                consultationLabel={isSold ? CONVERSION_CTA.consultation : CONVERSION_CTA.viewing}
              />
              {listingId != null ? (
                <Button variant="outline" className="w-full" asChild>
                  <Link to={`/presentation/listing/${listingId}`}>
                    <FileText className="w-4 h-4 mr-2" />
                    Презентация PDF
                  </Link>
                </Button>
              ) : null}
            </div>

        <div className="space-y-8 sm:space-y-10 mt-6 lg:mt-6">
          <ApartmentCharacteristics
            apartment={apt}
            building={building}
            complex={complex}
            roomLabel={roomLabel}
          />

          <section id="building-context" className="scroll-mt-28 rounded-xl border border-border bg-card p-5 sm:p-6">
            {sectionHeading('Корпус и ЖК')}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{building.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Сдача: {building.deadline || '—'} · {building.floors} этажей
                  {building.sections > 0 ? ` · ${building.sections} секций` : ''}
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link to={`/complex/${complex.slug}`}>
                  <Building2 className="w-4 h-4 mr-2" />
                  Страница ЖК
                </Link>
              </Button>
            </div>
          </section>

          <section id="description" className="scroll-mt-28">
            {sectionHeading('О квартире')}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {roomLabel} площадью {apt.area} м²
                {apt.floor > 0 ? ` на ${apt.floor} этаже ${apt.totalFloors}-этажного дома` : ''} в ЖК «{complex.name}».
                {apt.finishing !== 'без отделки' ? ` Отделка: ${apt.finishing}.` : ' Без отделки.'}
                {complex.district && complex.district !== '—' ? (
                  <>
                    {' '}
                    Район:{' '}
                    {districtCatalogUrl ? (
                      <Link to={districtCatalogUrl} className="text-primary hover:underline">
                        {complex.district}
                      </Link>
                    ) : (
                      complex.district
                    )}
                    .
                  </>
                ) : null}
                {complex.subway && complex.subway !== '—' ? (
                  <>
                    {' '}
                    Метро{' '}
                    {subwayCatalogUrl ? (
                      <Link to={subwayCatalogUrl} className="text-primary hover:underline">
                        {complex.subway}
                      </Link>
                    ) : (
                      complex.subway
                    )}
                    {complex.subwayDistance !== '—' ? ` (${complex.subwayDistance})` : ''}.
                  </>
                ) : null}
                {apt.kitchenArea > 0 ? ` Кухня ${apt.kitchenArea} м².` : ''}
              </p>
              {complex.description?.trim() && complex.description !== `Жилой комплекс «${complex.name}».` ? (
                <p className="text-sm text-muted-foreground leading-relaxed mt-4 pt-4 border-t border-border">
                  {complex.description.replace(/<[^>]+>/g, '').slice(0, 800)}
                  {complex.description.length > 800 ? '…' : ''}
                </p>
              ) : null}
            </div>
          </section>

          <section id="map" className="scroll-mt-28">
            {sectionHeading('Расположение')}
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              {complex.address && complex.address !== '—' ? (
                <div className="p-4 border-b border-border flex flex-wrap items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{complex.address}</span>
                </div>
              ) : null}
              {hasCoords ? (
                <div ref={mapRef} className="h-[min(360px,45vh)] min-h-[220px] bg-muted" />
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Координаты ЖК пока не указаны. Карта появится, когда их заполнят в админке.
                </p>
              )}
            </div>
          </section>

          {listingId != null ? (
            <RelatedListingsCarousel
              title="Похожие по цене"
              fetchUrl={`/discovery/listings/${listingId}/price-neighbors?limit=8`}
              queryKey={['discovery', 'price-neighbors', listingId]}
              excludeId={listingId}
              className="scroll-mt-28"
            />
          ) : null}

          {similarApts.length > 0 ? (
            <section id="similar" className="scroll-mt-28">
              {sectionHeading(`Похожие квартиры в ${complex.name}`)}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {similarApts.map((a) => (
                  <Link
                    key={a.id}
                    to={`/apartment/${a.id}`}
                    className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md hover:-translate-y-px transition-all"
                  >
                    <StableMediaFrame
                      src={a.planImage}
                      altContext={`${a.rooms === 0 ? 'Студия' : `${a.rooms}-комн`}, ${a.area} м²`}
                      aspect="4/3"
                      fallback="branded"
                      loading="lazy"
                      imgClassName="object-contain p-4 opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="p-3 space-y-1 border-t border-border">
                      <h4 className="font-semibold text-sm">
                        {a.rooms === 0 ? 'Студия' : `${a.rooms}-комн`}, {a.area} м²
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Этаж {a.floor}/{a.totalFloors} · {a.finishing}
                      </p>
                      <p className="font-bold text-sm text-primary">{formatDisplayPrice(a.price)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {listingId != null ? (
            <SessionDiscoverySection
              regionId={regionId}
              excludeListingId={listingId}
              className="scroll-mt-28"
            />
          ) : null}

          <section id="lead" className="scroll-mt-28">
            {sectionHeading('Связаться с нами', isSold ? 'Объект продан, оставьте заявку на консультацию по похожим' : 'Оставьте заявку на консультацию или просмотр')}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <LeadForm
                title=""
                embedded
                source={`Квартира: ${apt.id}`}
                blockId={blockId ?? undefined}
                listingId={listingId ?? undefined}
                requestType={isSold ? 'CONSULTATION' : 'CONSULTATION'}
                contextFooter={
                  isSold
                    ? `Запрос по проданной квартире ${roomLabel}, ${apt.area} м² · ${complex.name}`
                    : undefined
                }
              />
            </div>
          </section>
        </div>
          </div>

          <aside className="hidden lg:block sticky top-20 self-start space-y-4">
            <ApartmentPriceTrust
              apartment={apt}
              complexName={complex.name}
              complexSlug={complex.slug}
              buildingName={building.name}
              address={complex.address}
              roomLabel={roomLabel}
            />
            <ConversionCTABar
              layout="stack"
              context={baseConsultContext}
              onConsultation={openConsultation}
              consultationLabel={isSold ? CONVERSION_CTA.consultation : CONVERSION_CTA.viewing}
            />
            {hasCoords ? (
              <Button
                variant="outline"
                className="w-full"
                type="button"
                onClick={() => scrollToSection('map')}
              >
                <MapPin className="w-4 h-4 mr-2" />
                Показать на карте
              </Button>
            ) : null}
            {listingId != null ? (
              <Button variant="outline" className="w-full" asChild>
                <Link to={`/presentation/listing/${listingId}`}>
                  <FileText className="w-4 h-4 mr-2" />
                  Презентация PDF
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="w-full" asChild>
                <Link to={`/presentation/${complex.slug}`}>
                  <FileText className="w-4 h-4 mr-2" />
                  Презентация PDF
                </Link>
              </Button>
            )}
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-40 border-t border-border bg-background/95 backdrop-blur-sm p-3 lg:hidden min-h-14">
        <ConversionCTABar
          layout="stack"
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
