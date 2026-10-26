import { formatArea } from '@/redesign/lib/listing-format';
import { useParams, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Building2,
  Ruler,
  Layers,
  Phone,
  MessageCircle,
  Heart,
  Share2,
  ChevronLeft,
  ChevronRight,
  TreePine,
  Hammer,
  Trees,
  Building as BuildingIcon,
  ParkingSquare,
  GitCompare,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import LeadForm from '@/shared/components/LeadForm';
import ConversionCTABar from '@/redesign/components/ConversionCTABar';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import { CONVERSION_CTA, type ConsultationContext } from '@/redesign/lib/conversion-cta';
import { apiGet } from '@/lib/api';
import TrustBadgeRow from '@/redesign/components/TrustBadgeRow';
import { formatPriceSafe, formatPricePerMeterSafe, hasValidPrice, isPriceFallbackText, PRICE_ON_REQUEST_CLASS } from '@/redesign/lib/display-price';
import { BRAND_LOGO_SRC } from '@/redesign/lib/branding';
import { cn } from '@/lib/utils';
import { useAuth } from '@/shared/hooks/useAuth';
import ListingLocationMap from '@/redesign/components/ListingLocationMap';
import { recordBrowseHistory } from '@/shared/lib/record-browse-history';
import RelatedListingsCarousel from '@/discovery/components/RelatedListingsCarousel';
import SessionDiscoverySection from '@/redesign/components/SessionDiscoverySection';
import CompareSessionChip from '@/shared/components/CompareSessionChip';
import { listingHref } from '@/shared/lib/browse-history-local';
import { useFavorites } from '@/shared/hooks/useFavorites';
import { shareCurrentPage } from '@/lib/share-page';
import { useCompare } from '@/shared/hooks/useCompare';
import { useEntitySeoMeta } from '@/shared/hooks/useEntitySeoMeta';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { toast } from '@/components/ui/sonner';

type ApiListingDetailUniversal = {
  id: number;
  kind: 'APARTMENT' | 'HOUSE' | 'LAND' | 'COMMERCIAL' | 'PARKING';
  blockId: number | null;
  status: string;
  dataSource?: string;
  price: string | number | null;
  title: string | null;
  address: string | null;
  description: string | null;
  sourceUrl: string | null;
  publicContact?: {
    kind: 'agent' | 'agency';
    slug?: string | null;
    fullName?: string | null;
    label?: string;
    phone?: string | null;
    avatarUrl?: string | null;
    showEmail?: boolean;
    email?: string | null;
  };
  region: { id: number; code?: string; name?: string } | null;
  block: { id: number; slug: string; name: string; addresses?: { address: string }[] } | null;
  builder: { name: string } | null;
  district: { name: string } | null;
  apartment: null | {
    floor: number | null;
    floorsTotal: number | null;
    areaTotal: string | number | null;
    areaKitchen: string | number | null;
    blockAddress?: string | null;
    planUrl?: string | null;
    finishingPhotoUrl?: string | null;
    extraPhotoUrls?: unknown;
    roomType?: { name: string } | null;
    finishing?: { name: string } | null;
  };
  house: null | {
    houseType?: string | null;
    areaTotal?: string | number | null;
    areaLand?: string | number | null;
    floorsCount?: number | null;
    bedrooms?: number | null;
    yearBuilt?: number | null;
    photoUrl?: string | null;
    extraPhotoUrls?: unknown;
  };
  land: null | {
    areaSotki?: string | number | null;
    landCategory?: string | null;
    photoUrl?: string | null;
    extraPhotoUrls?: unknown;
  };
  commercial: null | {
    commercialType?: string | null;
    area?: string | number | null;
    floor?: number | null;
    hasSeparateEntrance?: boolean | null;
  };
  parking: null | {
    parkingType?: string | null;
    area?: string | number | null;
    floor?: number | null;
    number?: string | null;
  };
  mediaFiles?: { id: number; url: string; kind: string; sortOrder: number | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Свободно',
  RESERVED: 'Бронь',
  SOLD: 'Продано',
  DRAFT: 'Черновик',
  INACTIVE: 'Снято с публикации',
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  RESERVED: 'bg-warning-soft text-warning',
  SOLD: 'bg-muted text-muted-foreground',
  DRAFT: 'bg-muted text-muted-foreground',
  INACTIVE: 'bg-red-100 text-red-800',
};

const KIND_LABEL: Record<string, string> = {
  APARTMENT: 'Квартира',
  HOUSE: 'Дом',
  LAND: 'Участок',
  COMMERCIAL: 'Коммерческое помещение',
  PARKING: 'Машиноместо',
};

const DATA_SOURCE_LABEL: Record<string, string> = {
  FEED: 'Официальный фид застройщика',
  MANUAL: 'Размещено агентом',
};

const KIND_ICON: Record<string, typeof BuildingIcon> = {
  APARTMENT: BuildingIcon,
  HOUSE: TreePine,
  LAND: Trees,
  COMMERCIAL: Hammer,
  PARKING: ParkingSquare,
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function buildTitle(l: ApiListingDetailUniversal): string {
  switch (l.kind) {
    case 'APARTMENT': {
      const rooms = l.apartment?.roomType?.name?.trim();
      const area = num(l.apartment?.areaTotal);
      const parts = [rooms || 'Квартира', area > 0 ? formatArea(area) : null].filter(Boolean);
      return parts.join(' · ');
    }
    case 'HOUSE': {
      const area = num(l.house?.areaTotal);
      const land = num(l.house?.areaLand);
      const head = 'Дом';
      const tail = [
        area > 0 ? formatArea(area) : null,
        land > 0 ? `участок ${land} сот.` : null,
      ].filter(Boolean);
      return tail.length ? `${head} · ${tail.join(' · ')}` : head;
    }
    case 'LAND': {
      const sotki = num(l.land?.areaSotki);
      return sotki > 0 ? `Участок · ${sotki} сот.` : 'Участок';
    }
    case 'COMMERCIAL': {
      const area = num(l.commercial?.area);
      const t = l.commercial?.commercialType?.trim() || 'Коммерция';
      return area > 0 ? `${t} · ${area} м²` : t;
    }
    case 'PARKING': {
      const area = num(l.parking?.area);
      const t = l.parking?.parkingType?.trim() || 'Машиноместо';
      return area > 0 ? `${t} · ${area} м²` : t;
    }
    default:
      return 'Объект';
  }
}

function buildPhotos(l: ApiListingDetailUniversal): string[] {
  const fromMedia = (l.mediaFiles ?? [])
    .filter((m) => m.kind === 'PHOTO')
    .map((m) => m.url);
  if (fromMedia.length) return fromMedia;
  const list: string[] = [];
  switch (l.kind) {
    case 'APARTMENT': {
      if (l.apartment?.finishingPhotoUrl) list.push(l.apartment.finishingPhotoUrl);
      if (l.apartment?.planUrl) list.push(l.apartment.planUrl);
      list.push(...arr(l.apartment?.extraPhotoUrls));
      break;
    }
    case 'HOUSE': {
      if (l.house?.photoUrl) list.push(l.house.photoUrl);
      list.push(...arr(l.house?.extraPhotoUrls));
      break;
    }
    case 'LAND': {
      if (l.land?.photoUrl) list.push(l.land.photoUrl);
      list.push(...arr(l.land?.extraPhotoUrls));
      break;
    }
    default:
      break;
  }
  if (!list.length) return [];
  return list;
}

/** Планировки нельзя растягивать на весь блок — только вписать с отступами */
function isListingPlanImage(l: ApiListingDetailUniversal, src: string): boolean {
  if (!src) return false;
  if (l.kind === 'APARTMENT') {
    const plan = l.apartment?.planUrl?.trim();
    if (plan && plan === src) return true;
  }
  return (l.mediaFiles ?? []).some((m) => m.kind === 'PLAN' && m.url === src);
}

function buildAttributes(l: ApiListingDetailUniversal): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  switch (l.kind) {
    case 'APARTMENT': {
      const a = l.apartment;
      if (a?.areaTotal != null && num(a.areaTotal) > 0) out.push({ label: 'Общая площадь', value: `${num(a.areaTotal)} м²` });
      if (a?.areaKitchen != null && num(a.areaKitchen) > 0) out.push({ label: 'Кухня', value: `${num(a.areaKitchen)} м²` });
      if (a?.floor != null) out.push({ label: 'Этаж', value: a.floorsTotal ? `${a.floor} из ${a.floorsTotal}` : String(a.floor) });
      if (a?.finishing?.name) out.push({ label: 'Отделка', value: a.finishing.name });
      break;
    }
    case 'HOUSE': {
      const h = l.house;
      if (h?.areaTotal != null && num(h.areaTotal) > 0) out.push({ label: 'Площадь дома', value: `${num(h.areaTotal)} м²` });
      if (h?.areaLand != null && num(h.areaLand) > 0) out.push({ label: 'Участок', value: `${num(h.areaLand)} сот.` });
      if (h?.floorsCount != null) out.push({ label: 'Этажей', value: String(h.floorsCount) });
      if (h?.bedrooms != null) out.push({ label: 'Спален', value: String(h.bedrooms) });
      if (h?.yearBuilt != null) out.push({ label: 'Год постройки', value: String(h.yearBuilt) });
      if (h?.houseType) out.push({ label: 'Тип дома', value: h.houseType });
      break;
    }
    case 'LAND': {
      const land = l.land;
      if (land?.areaSotki != null && num(land.areaSotki) > 0) out.push({ label: 'Площадь', value: `${num(land.areaSotki)} сот.` });
      if (land?.landCategory) out.push({ label: 'Категория', value: land.landCategory });
      break;
    }
    case 'COMMERCIAL': {
      const c = l.commercial;
      if (c?.area != null && num(c.area) > 0) out.push({ label: 'Площадь', value: `${num(c.area)} м²` });
      if (c?.commercialType) out.push({ label: 'Тип', value: c.commercialType });
      if (c?.floor != null) out.push({ label: 'Этаж', value: String(c.floor) });
      if (c?.hasSeparateEntrance != null) out.push({ label: 'Отдельный вход', value: c.hasSeparateEntrance ? 'Да' : 'Нет' });
      break;
    }
    case 'PARKING': {
      const p = l.parking;
      if (p?.area != null && num(p.area) > 0) out.push({ label: 'Площадь', value: `${num(p.area)} м²` });
      if (p?.parkingType) out.push({ label: 'Тип', value: p.parkingType });
      if (p?.floor != null) out.push({ label: 'Этаж/Уровень', value: String(p.floor) });
      if (p?.number) out.push({ label: 'Номер', value: p.number });
      break;
    }
  }
  return out;
}

function cmpListingKey(listingId: number): string {
  return `l:${listingId}`;
}

function pickAddress(l: ApiListingDetailUniversal): string | null {
  return (
    l.address ||
    l.apartment?.blockAddress ||
    l.block?.addresses?.[0]?.address ||
    null
  );
}

const RedesignListingDetail = () => {
  const { id: idParam } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isListingFavorite, toggleListing } = useFavorites();
  const { isCompared, toggle: toggleCompare, count: compareCount } = useCompare();
  const { shortName } = useSiteBrand();

  const listingId = useMemo(() => {
    const n = Number.parseInt(idParam ?? '', 10);
    return Number.isFinite(n) ? n : null;
  }, [idParam]);

  const [photoIdx, setPhotoIdx] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultContext, setConsultContext] = useState<ConsultationContext | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ['listing', 'detail-universal', listingId],
    queryFn: () => apiGet<ApiListingDetailUniversal>(`/listings/${listingId}`),
    enabled: listingId != null,
    retry: false,
  });

  const trustQuery = useQuery({
    queryKey: ['listing', 'trust', listingId],
    queryFn: () =>
      apiGet<{ qualityScore: number | null; badges: Array<{ kind: string; label: string }> }>(
        `/listings/${listingId}/trust`,
      ),
    enabled: listingId != null,
    staleTime: 60_000,
    retry: false,
  });

  const photos = useMemo(() => {
    if (!data) return [];
    if (data.kind === 'APARTMENT' && data.block) return [];
    return buildPhotos(data);
  }, [data]);

  const entitySeo = useMemo(() => {
    if (!data || listingId == null) return null;
    if (data.kind === 'APARTMENT' && data.block) return null;
    const title = data.title?.trim() || buildTitle(data);
    const price = num(data.price);
    const pricePart = isPriceFallbackText(formatPriceSafe(price)) ? '' : formatPriceSafe(price);
    const kindLabel = KIND_LABEL[data.kind] ?? 'Объект';
    const address = pickAddress(data);
    const description = [kindLabel, pricePart, address, data.region?.name]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 160);
    const path = `/listing/${listingId}`;
    const imageUrl = photos[0] ?? null;
    const schemaType =
      data.kind === 'HOUSE' ? 'SingleFamilyResidence' : data.kind === 'LAND' ? 'Landform' : 'Product';
    return {
      title,
      description: description || `${kindLabel} на ${shortName}`,
      pathname: path,
      imageUrl,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': schemaType,
        name: title,
        url: `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`,
        ...(hasValidPrice(price)
          ? { offers: { '@type': 'Offer', price, priceCurrency: 'RUB', availability: 'https://schema.org/InStock' } }
          : {}),
        ...(address ? { address: { '@type': 'PostalAddress', streetAddress: address } } : {}),
      },
    };
  }, [data, listingId, photos, shortName]);

  useEntitySeoMeta(entitySeo);

  useEffect(() => {
    setHeroFailed(false);
  }, [photoIdx, listingId, photos.length, photos[0] ?? '']);

  useEffect(() => {
    if (!data || listingId == null) return;
    const title = data.title ?? data.address ?? undefined;
    const href = listingHref(
      listingId,
      data.kind,
      data.block?.slug ?? null,
    );
    void recordBrowseHistory('LISTING', listingId, title, href);
  }, [data, listingId]);

  if (listingId == null) {
    return <Navigate to="/catalog" replace />;
  }

  if (isPending) {
    return (
      <div className="min-h-screen bg-background pb-32 lg:pb-0">
        <RedesignHeader />
        <div className="max-w-[1400px] mx-auto px-4 py-6 animate-pulse space-y-4">
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 aspect-[4/3] bg-muted rounded-2xl" />
            <div className="lg:col-span-2 space-y-3">
              <div className="h-8 bg-muted rounded w-2/3" />
              <div className="h-6 bg-muted rounded w-1/2" />
              <div className="h-24 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background">
        <RedesignHeader />
        <div className="max-w-[1400px] mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Объект не найден</p>
          <Link to="/catalog" className="text-primary text-sm mt-2 inline-block">← Каталог</Link>
        </div>
      </div>
    );
  }

  // Если это квартира c блоком — отдадим работу старой странице.
  if (data.kind === 'APARTMENT' && data.block) {
    return <Navigate to={`/apartment/${data.id}`} replace />;
  }

  const attributes = buildAttributes(data);
  const computedTitle = buildTitle(data);
  const donorTitle = data.title?.trim() || null;
  const title = donorTitle ?? computedTitle;
  const description = data.description?.trim() || null;
  const KindIcon = KIND_ICON[data.kind] ?? BuildingIcon;
  const price = num(data.price);
  const priceDisplay = formatPriceSafe(price);
  const address = pickAddress(data);
  const regionName = data.region?.name ?? '';
  const statusTone = STATUS_TONE[data.status] ?? 'bg-muted text-muted-foreground';
  const statusLabel = STATUS_LABEL[data.status] ?? data.status;

  const liked = isListingFavorite(data.id);
  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }
    void toggleListing(data.id);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    void shareCurrentPage({ title });
  };

  const cmpKey = cmpListingKey(data.id);
  const inCompare = isCompared(cmpKey);
  const handleCompare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inCompare && compareCount >= 3) {
      toast.error('В сравнении не более 3 объектов');
      return;
    }
    toggleCompare(cmpKey);
  };

  const baseConsultContext: ConsultationContext = {
    surface: 'listing',
    source: `listing:${data.id}`,
    listingId: data.id,
    blockId: data.blockId ?? data.block?.id ?? undefined,
    sold: data.status === 'SOLD',
    requestType: 'CONSULTATION',
    contextFooter: `${KIND_LABEL[data.kind] ?? data.kind} #${data.id}`,
  };

  const openConsultation = (ctx: ConsultationContext) => {
    setConsultContext(ctx);
    setConsultOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-32 lg:pb-0">
      <RedesignHeader />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <Link to="/" className="inline-flex min-h-8 items-center transition-colors hover:text-foreground">Главная</Link>
            <span>/</span>
            <Link to="/catalog" className="inline-flex min-h-8 items-center transition-colors hover:text-foreground">Каталог</Link>
            {regionName ? (
              <>
                <span>/</span>
                <Link
                  to={`/catalog?region_id=${data.region!.id}`}
                  className="inline-flex min-h-8 items-center transition-colors hover:text-foreground"
                >
                  {regionName}
                </Link>
              </>
            ) : null}
            <span>/</span>
            <span className="text-foreground font-medium">{title}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Photos + description */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="relative aspect-[4/3] bg-muted/40">
                {photos.length === 0 || heroFailed ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/50 p-8">
                    <img
                      src={BRAND_LOGO_SRC}
                      alt=""
                      className="max-h-[48%] max-w-[58%] object-contain opacity-45"
                    />
                  </div>
                ) : photos[photoIdx] &&
                  isListingPlanImage(data, photos[photoIdx]!) ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/40 p-6 sm:p-8 md:p-10">
                    <img
                      src={photos[photoIdx]!}
                      alt={title}
                      className="max-h-full max-w-full object-contain"
                      onError={() => setHeroFailed(true)}
                    />
                  </div>
                ) : (
                  <img
                    src={photos[photoIdx]!}
                    alt={title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setHeroFailed(true)}
                  />
                )}
                <span
                  className={cn(
                    'absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
                    statusTone,
                  )}
                >
                  {statusLabel}
                </span>
                <div className="absolute top-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border border-border/70 bg-background/90 backdrop-blur-sm px-1 py-1 shadow-sm">
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleFavorite}>
                    <Heart className={cn('w-4 h-4', liked ? 'fill-destructive text-destructive' : 'text-muted-foreground')} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={inCompare ? 'Убрать из сравнения' : 'Добавить в сравнение'}
                    onClick={handleCompare}
                  >
                    <GitCompare className={cn('w-4 h-4', inCompare ? 'text-primary' : 'text-muted-foreground')} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Презентация (PDF)" asChild>
                    <Link to={`/presentation/listing/${data.id}`}>
                      <FileText className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Поделиться" onClick={handleShare}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
                {photos.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-foreground hover:bg-background flex items-center justify-center"
                      aria-label="Предыдущее фото"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-foreground hover:bg-background flex items-center justify-center"
                      aria-label="Следующее фото"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur text-xs text-muted-foreground border border-border">
                      {photoIdx + 1} / {photos.length}
                    </div>
                  </>
                ) : null}
              </div>
              {photos.length > 1 ? (
                <div className="px-3 py-3 flex gap-2 overflow-x-auto">
                  {photos.map((src, i) => (
                    <button
                      type="button"
                      key={`${src}-${i}`}
                      onClick={() => setPhotoIdx(i)}
                      className={cn(
                        'shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-colors flex items-center justify-center bg-muted/30',
                        i === photoIdx ? 'border-primary' : 'border-transparent hover:border-border',
                      )}
                    >
                      <img
                        src={src}
                        alt=""
                        className={cn(
                          'w-full h-full',
                          data && isListingPlanImage(data, src) ? 'object-contain p-1' : 'object-cover',
                        )}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Attributes */}
            {attributes.length > 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <KindIcon className="w-4 h-4 text-primary" />
                  Характеристики
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {attributes.map((a) => (
                    <div key={a.label} className="flex items-baseline justify-between border-b border-dashed border-border/60 pb-1.5">
                      <dt className="text-muted-foreground">{a.label}</dt>
                      <dd className="font-medium text-right">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {/* Description */}
            {description ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-3">Описание</h3>
                <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                  {description}
                </p>
                {data.sourceUrl ? (
                  <a
                    href={data.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center text-xs text-primary hover:underline"
                  >
                    Источник объявления →
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* Location */}
            {(address || regionName) ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Расположение
                </h3>
                <p className="text-sm mb-4">
                  {[regionName, address].filter(Boolean).join(', ')}
                </p>
                {address ? (
                  <ListingLocationMap address={address} regionName={regionName} height="280px" />
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1.5">
                <KindIcon className="w-3.5 h-3.5" /> {KIND_LABEL[data.kind] ?? 'Объект'}
                {data.block ? (
                  <>
                    {' · '}
                    <Link to={`/complex/${data.block.slug}`} className="hover:text-primary">{data.block.name}</Link>
                  </>
                ) : null}
              </p>
              <h1 className="text-2xl font-bold mb-1">{title}</h1>
              {trustQuery.data?.badges?.length ? (
                <TrustBadgeRow badges={trustQuery.data.badges} className="mb-2" />
              ) : null}
              {data.dataSource ? (
                <p className="text-xs text-muted-foreground mb-2">
                  {DATA_SOURCE_LABEL[data.dataSource] ?? data.dataSource}
                </p>
              ) : null}
              {address || regionName ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
                  <MapPin className="w-3.5 h-3.5" />
                  {[regionName, address].filter(Boolean).join(' · ')}
                </div>
              ) : (
                <div className="mb-5" />
              )}

              <div className="border-t border-border pt-5 mb-5">
                <p className={cn('text-3xl font-bold', isPriceFallbackText(priceDisplay) && PRICE_ON_REQUEST_CLASS)}>{priceDisplay}</p>
                {data.kind === 'APARTMENT' && data.apartment?.areaTotal ? (
                  <p className={cn('text-sm mt-1', isPriceFallbackText(formatPricePerMeterSafe(price, data.apartment.areaTotal)) && PRICE_ON_REQUEST_CLASS)}>
                    {formatPricePerMeterSafe(price, data.apartment.areaTotal)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2.5">
                    <Building2 className="w-4 h-4" />
                    Тип
                  </span>
                  <span className="font-medium">{KIND_LABEL[data.kind]}</span>
                </div>
                {regionName ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2.5">
                      <MapPin className="w-4 h-4" />
                      Регион
                    </span>
                    <span className="font-medium">{regionName}</span>
                  </div>
                ) : null}
                {data.kind === 'APARTMENT' && data.apartment?.areaTotal ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2.5">
                      <Ruler className="w-4 h-4" />
                      Площадь
                    </span>
                    <span className="font-medium">{num(data.apartment.areaTotal)} м²</span>
                  </div>
                ) : null}
                {data.kind === 'APARTMENT' && data.apartment?.floor ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2.5">
                      <Layers className="w-4 h-4" />
                      Этаж
                    </span>
                    <span className="font-medium">
                      {data.apartment.floor}{data.apartment.floorsTotal ? ` из ${data.apartment.floorsTotal}` : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <ConversionCTABar
                context={{
                  surface: 'listing',
                  source: `listing:${data.id}`,
                  listingId: data.id,
                  blockId: data.blockId ?? data.block?.id ?? undefined,
                  sold: data.status === 'SOLD',
                  contextFooter: `${KIND_LABEL[data.kind] ?? data.kind} #${data.id}`,
                }}
                onConsultation={openConsultation}
                consultationLabel={CONVERSION_CTA.viewing}
              />
            </div>

            {data.publicContact ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground mb-3">
                  {data.publicContact.kind === 'agent' ? 'Ответственный агент' : 'Контакт агентства'}
                </p>
                <div className="flex items-center gap-3">
                  {data.publicContact.avatarUrl ? (
                    <img
                      src={data.publicContact.avatarUrl}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-sm font-bold text-accent-foreground">
                      {(data.publicContact.fullName ?? data.publicContact.label ?? '?').charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {data.publicContact.fullName ?? data.publicContact.label ?? 'Контакт'}
                    </p>
                    {data.publicContact.phone ? (
                      <a
                        href={`tel:${data.publicContact.phone.replace(/\s/g, '')}`}
                        className="text-sm text-primary font-medium inline-flex items-center gap-1 mt-1"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {data.publicContact.phone}
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Телефон уточняйте через заявку</p>
                    )}
                    {data.publicContact.showEmail && data.publicContact.email ? (
                      <p className="text-xs text-muted-foreground mt-1">{data.publicContact.email}</p>
                    ) : null}
                  </div>
                </div>
                {data.publicContact.kind === 'agent' && data.publicContact.slug ? (
                  <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-muted/50"
                    >
                      <Link to={`/agent/${data.publicContact.slug}`}>Информация об агенте</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-muted/50"
                    >
                      <Link to={`/agent/${data.publicContact.slug}/listings`}>Объявления агента</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : data.builder?.name ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-sm font-bold text-accent-foreground">
                    {data.builder.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{data.builder.name}</p>
                    <p className="text-xs text-muted-foreground">Партнёр</p>
                  </div>
                </div>
              </div>
            ) : null}

            <LeadForm
              title={CONVERSION_CTA.consultation}
              source={`Объявление #${data.id} (${KIND_LABEL[data.kind]})`}
              listingId={data.id}
              requestType="CONSULTATION"
            />

            <RelatedListingsCarousel
              title="Похожие объекты"
              fetchUrl={`/discovery/listings/${data.id}/related?limit=12`}
              queryKey={['discovery', 'related', 'listing', data.id]}
              excludeId={data.id}
              className="mt-6"
            />

            <SessionDiscoverySection
              regionId={data.region?.id ?? null}
              excludeListingId={data.id}
              className="mt-8"
            />
          </div>
        </div>
      </div>

      <CompareSessionChip />

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-40 border-t border-border bg-background/95 backdrop-blur-sm p-3 lg:hidden">
        <ConversionCTABar
          context={baseConsultContext}
          onConsultation={openConsultation}
          consultationLabel={data.status === 'SOLD' ? CONVERSION_CTA.consultation : CONVERSION_CTA.viewing}
        />
      </div>

      <ConsultationFlow open={consultOpen} onOpenChange={setConsultOpen} context={consultContext} />
      <FooterSection />
    </div>
  );
};

export default RedesignListingDetail;
