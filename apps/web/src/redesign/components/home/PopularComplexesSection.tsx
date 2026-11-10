import { useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Heart, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import SnapRail from '@/redesign/components/home/SnapRail';
import type { ResidentialComplex } from '@/redesign/data/types';
import { complexPopularCompletionLine, complexTotalUnits } from '@/redesign/lib/card-visual';
import { formatPriceFromExact, normalizePriceValue } from '@/redesign/lib/display-price';
import { parseApiBlockId, useFavorites } from '@/shared/hooks/useFavorites';
import { prefetchHandlers } from '@/shared/lib/route-prefetch';

/*
 * «Популярные ЖК» — по согласованному референсу (LiveGrid): ровная сетка одинаковых карточек,
 * 4 в ряд на широком экране. Карточка: фото-карусель с точками и «сердечком», название,
 * срок сдачи и адрес, цены «от» по комнатности с отточием, «Квартир N», тег «Новостройки».
 * Метро по ТЗ не используем — вместо строки с метро срок сдачи.
 * Все цифры из каталога: нет данных — строки нет.
 */

type Props = {
  complexes: ResidentialComplex[];
  cityFallback?: string;
  onCoverError: (id: string) => void;
};

const realValue = (v?: string) => (v && v.trim() && v.trim() !== '—' ? v.trim() : '');

/** Подписи как в референсе: «Студии», «1-к.кв», «2Е-к.кв», «2-к.кв»… */
function roomLabel(rooms: number): string {
  if (rooms === 0) return 'Студии';
  if (rooms === 2) return '2Е-к.кв';
  if (rooms === 21) return '2-к.кв';
  if (rooms >= 4) return '4+-к.кв';
  return `${rooms}-к.кв`;
}

const roomSortKey = (rooms: number) => (rooms === 21 ? 2.5 : rooms);

function priceRows(c: ResidentialComplex) {
  return (c.priceRanges ?? [])
    .filter((r) => normalizePriceValue(r.priceMin) != null)
    .sort((a, b) => roomSortKey(a.rooms) - roomSortKey(b.rooms))
    .slice(0, 4)
    .map((r) => ({ rooms: r.rooms, label: roomLabel(r.rooms), price: formatPriceFromExact(r.priceMin) }));
}

/** Фото-карусель: свайп/скролл на телефоне, на десктопе фото меняется при движении мыши (как в ЦИАН). */
function CoverCarousel({
  images,
  name,
  priority,
  onError,
}: {
  images: string[];
  name: string;
  priority: boolean;
  onError: () => void;
}) {
  const shots = images.slice(0, 5);
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'auto' });
    setActive(i);
  };

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (shots.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.min(shots.length - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * shots.length)));
    if (i !== active) goTo(i);
  };

  return (
    <div className="relative h-full w-full" onMouseMove={onMouseMove} onMouseLeave={() => shots.length > 1 && goTo(0)}>
      <div
        ref={trackRef}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== active) setActive(i);
        }}
      >
        {shots.map((src, i) => (
          <div key={src + i} className="h-full w-full shrink-0 snap-start">
            <StableMediaFrame
              src={src}
              altContext={`${name}, фото ${i + 1}`}
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 46vw, 86vw"
              loading={priority && i === 0 ? 'eager' : 'lazy'}
              fetchPriority={priority && i === 0 ? 'high' : undefined}
              fixedHeightClass="h-full w-full"
              className="h-full w-full"
              onImageError={i === 0 ? onError : undefined}
            />
          </div>
        ))}
      </div>
      {shots.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5" aria-hidden>
          {shots.map((_, i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-full transition-colors', i === active ? 'bg-white' : 'bg-white/50')} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PopularComplexCard({
  complex,
  cityFallback,
  priority,
  onCoverError,
}: {
  complex: ResidentialComplex;
  cityFallback?: string;
  priority: boolean;
  onCoverError: () => void;
}) {
  const { isBlockFavorite, toggleBlock } = useFavorites();
  const blockNum = parseApiBlockId(complex.id);
  const liked = blockNum != null && isBlockFavorite(blockNum);
  const href = `/complex/${complex.slug}`;
  const images = complex.images.filter((s) => Boolean(s?.trim()));
  const address = realValue(complex.address) || realValue(complex.district) || cityFallback || '';
  const rawCompletion = complexPopularCompletionLine(complex) || realValue(complex.deadline);
  const completion = /^(строится|сдан|проект)$/i.test(rawCompletion) ? '' : rawCompletion;
  const deadline = completion || (complex.status === 'completed' ? 'Дом сдан' : '');
  const rows = priceRows(complex);
  const units = complexTotalUnits(complex);

  const onLike = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (blockNum != null) void toggleBlock(blockNum);
  };

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow hover:shadow-raised">
      <Link to={href} {...prefetchHandlers('/complex/')} className="relative block aspect-[16/9] overflow-hidden bg-surface-soft" aria-label={`ЖК ${complex.name}`} tabIndex={-1}>
        {images.length > 0 ? <CoverCarousel images={images} name={complex.name} priority={priority} onError={onCoverError} /> : null}
      </Link>
      <button
        type="button"
        onClick={onLike}
        aria-pressed={liked}
        aria-label={liked ? 'Убрать из избранного' : 'В избранное'}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-card/95 text-foreground shadow-card transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Heart className={cn('h-[18px] w-[18px]', liked && 'fill-primary text-primary')} aria-hidden />
      </button>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="line-clamp-1 text-[18px] font-bold leading-snug tracking-tight text-foreground">
          <Link to={href} {...prefetchHandlers('/complex/')} className="after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none">
            {complex.name}
          </Link>
        </h3>

        <div className="mt-2.5 space-y-1.5 text-[14px] text-muted-foreground">
          {complex.status ? (
            <p className="flex items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', complex.status === 'completed' ? 'bg-success' : 'bg-primary')} aria-hidden />
              <span className="truncate">{complex.status === 'completed' ? 'Дом сдан' : complex.status === 'planned' ? 'Старт продаж' : 'Строится'}</span>
            </p>
          ) : null}
          {address ? (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{address}</span>
            </p>
          ) : null}
        </div>

        {deadline ? <p className="mt-2 text-[15px] font-semibold text-foreground">{deadline}</p> : null}

        {rows.length > 0 ? (
          <dl className="mt-3 space-y-1.5 text-[14px]">
            {rows.map((r) => (
              <div key={r.rooms} className="flex items-baseline gap-2">
                <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
                <span className="mb-[3px] min-w-[12px] flex-1 border-b border-dotted border-border" aria-hidden />
                <dd className="shrink-0 font-semibold tabular-nums text-foreground">{r.price}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-[15px] text-foreground">Цена по запросу</p>
        )}

        {units ? <p className="mt-3 text-[13px] text-muted-foreground">Квартир {units.toLocaleString('ru-RU')}</p> : null}

        <div className="mt-auto pt-4">
          <div className="border-t border-border/70 pt-4">
            <span className="inline-flex h-9 items-center rounded-lg border border-primary/70 px-3.5 text-[14px] font-semibold text-primary">Новостройки</span>
          </div>
        </div>
      </div>
    </article>
  );
}

const PopularComplexesSection = ({ complexes, cityFallback, onCoverError }: Props) => {
  if (complexes.length === 0) return null;

  return (
    <section className="container-page section-y" aria-labelledby="popular-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-7">
        <h2 id="popular-title" className="text-section-title">
          Популярные ЖК
        </h2>
        <div className="flex items-center gap-2">
          <Link
            to="/map"
            className="hidden h-11 items-center gap-2 rounded-xl border border-primary/70 px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/5 sm:inline-flex"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            На карте
          </Link>
          <Link
            to="/catalog?type=apartments&market=new"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/70 px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            Все предложения
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <SnapRail label="Популярные жилые комплексы" desktopCols={3} wideCols={4}>
        {complexes.map((c, i) => (
          <PopularComplexCard key={c.id} complex={c} cityFallback={cityFallback} priority={i === 0} onCoverError={() => onCoverError(c.id)} />
        ))}
      </SnapRail>
    </section>
  );
};

export default PopularComplexesSection;
