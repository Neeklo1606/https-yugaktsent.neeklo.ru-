import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import type { ResidentialComplex } from '@/redesign/data/types';
import { complexPopularCompletionLine } from '@/redesign/lib/card-visual';
import { formatPriceFrom, hasValidPrice } from '@/redesign/lib/display-price';

type Props = {
  complex: ResidentialComplex;
  /** Город из выбранного региона — если у ЖК нет своего района/адреса */
  cityFallback?: string;
  priority?: boolean;
  className?: string;
  /** Обложка не загрузилась у источника */
  onCoverError?: () => void;
};

const realValue = (v?: string) => (v && v.trim() && v.trim() !== '—' ? v.trim() : '');

function statusBadge(c: ResidentialComplex): string | null {
  if (c.status === 'completed') return 'Сдан';
  if (c.isPromoted) return 'Новый ЖК';
  if (c.status === 'building') return 'Строится';
  return null;
}

/**
 * Карточка ЖК для подборок главной (ТЗ v3, 4.4): фото, название, локация, срок, цена «от».
 * Детальные цены по комнатности — на странице ЖК и в каталоге, не здесь.
 */
const FeaturedComplexCard = ({ complex, cityFallback, priority = false, className, onCoverError }: Props) => {
  const cover = complex.images.find((src) => Boolean(src?.trim()));
  const location = realValue(complex.district) || realValue(complex.address) || cityFallback || '';
  const rawCompletion = complexPopularCompletionLine(complex) || realValue(complex.deadline);
  const completion = /^(строится|сдан|проект)$/i.test(rawCompletion) ? '' : rawCompletion;
  const price = hasValidPrice(complex.priceFrom) ? formatPriceFrom(complex.priceFrom) : null;
  const badge = statusBadge(complex);

  return (
    <Link
      to={`/complex/${complex.slug}`}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-raised',
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft">
        {cover ? (
          <StableMediaFrame
            src={cover}
            altContext={complex.name}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            fixedHeightClass="h-full w-full"
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.02]"
            onImageError={onCoverError}
          />
        ) : null}
        {badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-[12px] font-medium text-foreground shadow-card">{badge}</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-[18px] font-semibold leading-snug tracking-tight text-foreground">{complex.name}</h3>
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
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {price ? <p className="text-price text-[18px] text-foreground">{price}</p> : <span />}
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-primary">
            Квартиры
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default FeaturedComplexCard;
