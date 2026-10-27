import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Heart, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResidentialComplex } from '@/redesign/data/types';
import { parseApiBlockId, useFavorites } from '@/shared/hooks/useFavorites';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import { complexMinPrice, complexPopularCompletionLine, complexTotalUnits } from '@/redesign/lib/card-visual';
import { prefetchHandlers } from '@/shared/lib/route-prefetch';
import { formatPriceFrom } from '@/redesign/lib/display-price';

interface Props {
  complex: ResidentialComplex;
  variant?: 'grid' | 'list' | 'compact';
  coverAspect?: '16/9' | '4/3';
  /** Подпись рынка: на карточке не выводится, оставлено для совместимости вызовов */
  tag?: 'new' | 'secondary';
  /** Карточка на первом экране: обложка грузится без lazy */
  priority?: boolean;
  /** Город региона — если у ЖК нет района и адреса */
  cityFallback?: string;
}

const realValue = (v?: string) => (v && v.trim() && v.trim() !== '—' ? v.trim() : '');

function statusBadge(c: ResidentialComplex): string | null {
  if (c.status === 'completed') return 'Сдан';
  if (c.isPromoted) return 'Новый ЖК';
  if (c.salesStartDate && new Date(c.salesStartDate).getTime() > Date.now()) return 'Старт продаж';
  if (c.status === 'building') return 'Строится';
  return null;
}

function flatsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'квартира' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'квартиры' : 'квартир';
  return `${n.toLocaleString('ru-RU')} ${word}`;
}

/**
 * Карточка ЖК каталога (ТЗ v3, 4.4): фото, статус, название, локация, срок, цена «от»
 * и число квартир. Цены по комнатности — на странице ЖК. Метро не выводим.
 */
const ComplexCard = ({ complex, variant = 'grid', coverAspect = '4/3', priority = false, cityFallback }: Props) => {
  const { isBlockFavorite, toggleBlock } = useFavorites();
  const blockNum = parseApiBlockId(complex.id);
  const liked = blockNum != null && isBlockFavorite(blockNum);
  const slug = complex.slug?.trim() ?? '';
  const cover = complex.images.find((src) => Boolean(src?.trim())) ?? null;
  const location = realValue(complex.district) || realValue(complex.address) || cityFallback || '';
  const rawCompletion = complexPopularCompletionLine(complex) || realValue(complex.deadline);
  // В поле срока у части ЖК лежит статус («Строится») — он уже на бейдже, второй раз не пишем
  const completion = /^(строится|сдан|проект)$/i.test(rawCompletion) ? '' : rawCompletion;
  const minPrice = complexMinPrice(complex);
  const units = complexTotalUnits(complex);
  const badge = statusBadge(complex);
  const isList = variant === 'list';

  // Избранное гостя живёт в localStorage — вход для него не нужен (ТЗ v3, 4.1)
  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (blockNum != null) void toggleBlock(blockNum);
  };

  const media = (
    <div className={cn('relative overflow-hidden bg-surface-soft', isList ? 'w-[132px] shrink-0 sm:w-[220px]' : coverAspect === '16/9' ? 'aspect-video' : 'aspect-[4/3]')}>
      <StableMediaFrame
        src={cover}
        altContext={complex.name}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        fixedHeightClass="h-full w-full"
        className="h-full w-full"
        imgClassName="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      {badge ? (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-card/95 px-2.5 py-1 text-[12px] font-medium text-foreground shadow-card">{badge}</span>
      ) : null}
      {blockNum != null ? (
        <button
          type="button"
          onClick={handleLike}
          aria-pressed={liked}
          aria-label={liked ? 'Убрать из избранного' : 'В избранное'}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-card/95 shadow-card transition-transform hover:scale-105"
        >
          <Heart className={cn('h-[18px] w-[18px]', liked ? 'fill-destructive text-destructive' : 'text-foreground/70')} />
        </button>
      ) : null}
    </div>
  );

  const body = (
    <div className={cn('flex min-w-0 flex-1 flex-col', isList ? 'p-3 sm:p-4' : 'p-4')}>
      <h3 className="line-clamp-1 text-[17px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
        {complex.name}
      </h3>
      <ul className="mt-1.5 grid gap-1 text-[14px] text-muted-foreground">
        {location ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{location}</span>
          </li>
        ) : null}
        {completion ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{completion}</span>
          </li>
        ) : null}
      </ul>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="min-w-0">
          {minPrice != null ? <p className="text-price text-[17px] text-foreground">{formatPriceFrom(minPrice)}</p> : null}
          {units != null && units > 0 ? <p className="text-[13px] text-muted-foreground">{flatsLabel(units)} в продаже</p> : null}
        </div>
        {!isList ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-primary">
            Квартиры
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
  );

  const className = cn(
    'group flex h-full w-full overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-raised',
    isList ? 'flex-row' : 'flex-col',
  );

  return slug ? (
    <Link to={`/complex/${slug}`} className={className} {...prefetchHandlers('/complex/')}>
      {media}
      {body}
    </Link>
  ) : (
    <div className={className}>
      {media}
      {body}
    </div>
  );
};

export default ComplexCard;
