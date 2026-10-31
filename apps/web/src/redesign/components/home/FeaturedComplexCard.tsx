import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import type { ResidentialComplex } from '@/redesign/data/types';
import { complexMinPrice, complexPopularCompletionLine, complexTotalUnits } from '@/redesign/lib/card-visual';
import { prefetchHandlers } from '@/shared/lib/route-prefetch';
import { formatPriceFrom } from '@/redesign/lib/display-price';
import { pluralRu } from '@/redesign/lib/listing-format';

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
 * Карточка ЖК для «Популярных ЖК» главной: фото, название, локация, срок, цена «от»,
 * число квартир в продаже. Строки всегда в одном порядке и одной высоты, чтобы
 * в сетке цена и срок стояли на одной линии у всех карточек.
 * Детальные цены по комнатности — на странице ЖК, не здесь.
 */
const FeaturedComplexCard = ({ complex, cityFallback, priority = false, className, onCoverError }: Props) => {
  const cover = complex.images.find((src) => Boolean(src?.trim()));
  const location = realValue(complex.district) || realValue(complex.address) || cityFallback || '';
  const rawCompletion = complexPopularCompletionLine(complex) || realValue(complex.deadline);
  const completion = /^(строится|сдан|проект)$/i.test(rawCompletion) ? '' : rawCompletion;
  // «от» — та же функция, что у карточки каталога и страницы ЖК: одна цена везде
  const minPrice = complexMinPrice(complex);
  const price = minPrice != null ? formatPriceFrom(minPrice) : null;
  const units = complexTotalUnits(complex);
  const badge = statusBadge(complex);

  return (
    <Link
      to={`/complex/${complex.slug}`}
      {...prefetchHandlers('/complex/')}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-raised',
        className,
      )}
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-surface-soft">
        {cover ? (
          <StableMediaFrame
            src={cover}
            altContext={complex.name}
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 33vw, (min-width: 640px) 46vw, 90vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            fixedHeightClass="h-full w-full"
            className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onImageError={onCoverError}
          />
        ) : null}
        {badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-[12px] font-medium text-foreground shadow-card">{badge}</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-[17px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{complex.name}</h3>
        <dl className="mb-3 mt-1.5 grid gap-1 text-[14px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Локация</dt>
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <dd className="truncate">{location || 'Анапа'}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Срок сдачи</dt>
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            <dd className="truncate">{completion || (complex.status === 'completed' ? 'Дом сдан' : 'Срок уточняйте')}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 pt-3">
          <div className="min-w-0">
            {price ? <p className="text-price text-[17px] leading-tight text-foreground">{price}</p> : <p className="text-[15px] text-foreground">Цена по запросу</p>}
            {units ? (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {units.toLocaleString('ru-RU')} {pluralRu(units, ['квартира', 'квартиры', 'квартир'])} в продаже
              </p>
            ) : null}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-primary">
            Смотреть
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default FeaturedComplexCard;
