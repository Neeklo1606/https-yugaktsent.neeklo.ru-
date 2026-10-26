import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDisplayPrice, isPriceFallbackText, priceAriaLabel } from '@/redesign/lib/display-price';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import PromotionBadge from '@/redesign/components/PromotionBadge';
import TrustBadgeRow, { type TrustBadgeView } from '@/redesign/components/TrustBadgeRow';
import { listingFreshnessBadge } from '@lg/shared';
import { formatQuarterFromDate } from '@/redesign/lib/card-visual';
import { formatArea, shortRoomLabel } from '@/redesign/lib/listing-format';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/shared/hooks/useFavorites';

export type ListingPromotionView = {
  tier: string;
  isActive: boolean;
  promotedUntil?: string | null;
};

export type ApiListingCardRow = {
  id: number;
  kind: string;
  lat?: string | number | null;
  lng?: string | number | null;
  title?: string | null;
  address?: string | null;
  price: string | number | null;
  status: string;
  dataSource?: string | null;
  lastActivityAt?: string | null;
  updatedAt?: string | null;
  promotion?: ListingPromotionView | null;
  block?: { name: string; slug: string } | null;
  region?: { code?: string; name?: string } | null;
  apartment?: {
    areaTotal: string | number | null;
    areaKitchen: string | number | null;
    floor: number | null;
    floorsTotal: number | null;
    planUrl: string | null;
    finishingPhotoUrl?: string | null;
    extraPhotoUrls?: unknown;
    roomType?: { name: string } | null;
    buildingDeadline?: string | null;
  } | null;
  house?: {
    areaTotal?: string | number | null;
    areaLand?: string | number | null;
    floorsCount?: number | null;
    bedrooms?: number | null;
    photoUrl?: string | null;
    extraPhotoUrls?: unknown;
  } | null;
  land?: {
    areaSotki?: string | number | null;
    landCategory?: string | null;
    photoUrl?: string | null;
    extraPhotoUrls?: unknown;
  } | null;
  commercial?: {
    commercialType?: string | null;
    area?: string | number | null;
    floor?: number | null;
  } | null;
  parking?: {
    parkingType?: string | null;
    area?: string | number | null;
    floor?: number | null;
  } | null;
};

interface Props {
  listing: ApiListingCardRow;
  variant?: 'grid' | 'list' | 'home';
  trustBadges?: TrustBadgeView[];
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickImage(l: ApiListingCardRow): string {
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
  if (l.kind === 'APARTMENT') {
    return (
      tryUrl(l.apartment?.planUrl) ??
      tryUrl(l.apartment?.finishingPhotoUrl) ??
      fromArray(l.apartment?.extraPhotoUrls) ??
      null
    );
  }
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

/**
 * Жильё меньше 10 м² не бывает: в фиде у части объектов площадь приходит
 * ровно единицей — это артефакт импорта, а не планировка. Показывать
 * «1 м²» в заголовке карточки хуже, чем не показывать площадь вовсе.
 */
const MIN_PLAUSIBLE_AREA_M2 = 10;

function plausibleArea(value: unknown): number {
  const n = num(value);
  return n >= MIN_PLAUSIBLE_AREA_M2 ? n : 0;
}

function buildTitle(l: ApiListingCardRow): string {
  switch (l.kind) {
    case 'HOUSE': {
      const area = plausibleArea(l.house?.areaTotal);
      return area > 0 ? `Дом · ${formatArea(area)}` : 'Дом';
    }
    case 'LAND': {
      const sotki = num(l.land?.areaSotki);
      return sotki > 0 ? `Участок · ${sotki} сот.` : 'Участок';
    }
    case 'COMMERCIAL': {
      const t = l.commercial?.commercialType?.trim();
      const area = plausibleArea(l.commercial?.area);
      const head = t || 'Коммерция';
      return area > 0 ? `${head} · ${formatArea(area)}` : head;
    }
    case 'PARKING': {
      const t = l.parking?.parkingType?.trim();
      const area = num(l.parking?.area);
      const head = t || 'Машиноместо';
      return area > 0 ? `${head} · ${formatArea(area)}` : head;
    }
    case 'APARTMENT':
    default: {
      const rooms = shortRoomLabel(l.apartment?.roomType?.name);
      const area = plausibleArea(l.apartment?.areaTotal);
      const parts = [rooms, area > 0 ? formatArea(area) : null].filter(Boolean);
      // Нет ни комнатности, ни правдоподобной площади — называем вещь своим именем
      return parts.length ? parts.join(' · ') : 'Квартира';
    }
  }
}

function buildSubtitle(l: ApiListingCardRow): string {
  const block = l.block?.name?.trim();
  const region = l.region?.name?.trim();
  if (block && region) return `${block} · ${region}`;
  return block || region || '—';
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Свободно', className: 'bg-success/10 text-success' },
  RESERVED: { label: 'Бронь', className: 'bg-warning-soft text-warning' },
  SOLD: { label: 'Продано', className: 'bg-muted text-muted-foreground' },
  DRAFT: { label: 'Черновик', className: 'bg-muted text-muted-foreground' },
  INACTIVE: { label: 'Снято', className: 'bg-muted text-muted-foreground' },
};

/**
 * Карточка объекта (ТЗ v3, 4.4): фото/планировка, чипы «Свободно» и «Актуально», цена,
 * «3-к.кв · 78,3 м²», ЖК и город, этаж и срок сдачи, сердечко. Кликабельна целиком.
 */
const ListingCard = ({ listing, variant = 'grid', trustBadges }: Props) => {
  const { isListingFavorite, toggleListing } = useFavorites();
  const liked = isListingFavorite(listing.id);
  const formatted = formatDisplayPrice(listing.price);
  const img = pickImage(listing);
  const title = buildTitle(listing);
  const subtitle = buildSubtitle(listing);
  const priceIsFallback = isPriceFallbackText(formatted);
  const status = STATUS_CHIP[listing.status] ?? null;
  const linkTo = listing.kind === 'APARTMENT' ? `/apartment/${listing.id}` : `/listing/${listing.id}`;
  const isList = variant === 'list';
  const isApartment = listing.kind === 'APARTMENT';
  const usesPlan = isApartment && !listing.apartment?.finishingPhotoUrl && Boolean(listing.apartment?.planUrl);
  const completionLine = formatQuarterFromDate(listing.apartment?.buildingDeadline ?? null);
  const floor = listing.apartment?.floor;
  const floorsTotal = listing.apartment?.floorsTotal;
  const floorLine = floor ? `${floor}${floorsTotal ? ` из ${floorsTotal}` : ''} этаж` : null;
  const facts = [floorLine, completionLine ? `сдача ${completionLine}` : null].filter(Boolean).join(' · ');
  const freshness = listingFreshnessBadge({
    dataSource: listing.dataSource,
    lastActivityAt: listing.lastActivityAt,
    updatedAt: listing.updatedAt,
  });

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleListing(listing.id);
  };

  return (
    <Link
      to={linkTo}
      className={cn(
        'group flex h-full w-full overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-raised',
        isList ? 'flex-row' : 'flex-col',
      )}
    >
      <div
        className={cn(
          'relative shrink-0 overflow-hidden',
          usesPlan ? 'bg-white' : 'bg-surface-soft',
          isList ? 'w-[132px] sm:w-[220px]' : 'aspect-[4/3] w-full',
        )}
      >
        <StableMediaFrame
          src={img}
          aspect="none"
          fit={usesPlan ? 'contain' : 'cover'}
          decorative={false}
          altContext={title}
          className={cn('absolute inset-0 h-full w-full', usesPlan && 'p-4')}
          imgClassName={usesPlan ? '' : 'transition-transform duration-300 group-hover:scale-[1.02]'}
        />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
          {status ? <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium', status.className)}>{status.label}</span> : null}
          {freshness?.tone === 'recent' ? (
            <span className="rounded-full bg-card/95 px-2 py-0.5 text-[12px] font-medium text-foreground shadow-card">Актуально</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleLike}
          aria-pressed={liked}
          aria-label={liked ? 'Убрать из избранного' : 'В избранное'}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-card/95 shadow-card transition-transform hover:scale-105"
        >
          <Heart className={cn('h-[18px] w-[18px]', liked ? 'fill-destructive text-destructive' : 'text-foreground/70')} />
        </button>
        <PromotionBadge promotion={listing.promotion ?? null} />
        {trustBadges?.length ? (
          <div className="absolute bottom-1.5 left-1.5 right-1.5">
            <TrustBadgeRow badges={trustBadges} compact />
          </div>
        ) : null}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1', isList ? 'p-3 sm:p-4' : 'p-4')}>
        <p
          className={cn('text-price text-[19px] leading-tight', priceIsFallback ? 'text-muted-foreground text-[15px] font-medium' : 'text-foreground')}
          aria-label={priceAriaLabel(formatted)}
        >
          {formatted}
        </p>
        <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary">{title}</h3>
        {subtitle !== '—' ? <p className="line-clamp-1 text-[14px] text-muted-foreground">{subtitle}</p> : null}
        {facts ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{facts}</p> : null}
      </div>
    </Link>
  );
};

export default ListingCard;
