import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, Home, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import SnapRail from '@/redesign/components/home/SnapRail';
import type { ResidentialComplex } from '@/redesign/data/types';
import { complexMinPrice, complexPopularCompletionLine, complexTotalUnits } from '@/redesign/lib/card-visual';
import { formatPriceFrom, normalizePriceValue } from '@/redesign/lib/display-price';
import { pluralRu } from '@/redesign/lib/listing-format';
import { prefetchHandlers } from '@/shared/lib/route-prefetch';

/*
 * «Популярные ЖК» на главной. Раскладка зависит от того, сколько ЖК реально есть,
 * чтобы блок не выглядел пустым:
 *  1 ЖК  — витрина на всю ширину: фото + факты + цены по комнатности + два действия;
 *  2 ЖК  — две крупные карточки;
 *  3+ ЖК — лидер крупно (2×2 на десктопе) и сетка остальных; на телефоне — лента со snap.
 * Все цифры — из каталога (цена «от», цены по комнатности, число квартир). Ничего не придумываем:
 * нет срока — строка не выводится, нет цены — «Цена по запросу».
 */

type Props = {
  complexes: ResidentialComplex[];
  cityFallback?: string;
  onCoverError: (id: string) => void;
};

const realValue = (v?: string) => (v && v.trim() && v.trim() !== '—' ? v.trim() : '');

function roomShortLabel(rooms: number): string {
  if (rooms === 0) return 'Студии';
  if (rooms === 2) return 'Евро-2';
  if (rooms === 21) return '2-комн.';
  if (rooms >= 4) return '4+ комн.';
  return `${rooms}-комн.`;
}

/** Для чипов в плитке: «Ст», «1к», «Е2», «2к», «3к», «4+к». */
function roomChipLabel(rooms: number): string {
  if (rooms === 0) return 'Ст';
  if (rooms === 2) return 'Е2';
  if (rooms === 21) return '2к';
  if (rooms >= 4) return '4+к';
  return `${rooms}к`;
}

function roomSortKey(rooms: number): number {
  return rooms === 21 ? 2.5 : rooms;
}

function roomPrices(c: ResidentialComplex, limit: number) {
  return (c.priceRanges ?? [])
    .filter((r) => normalizePriceValue(r.priceMin) != null)
    .sort((a, b) => roomSortKey(a.rooms) - roomSortKey(b.rooms))
    .slice(0, limit)
    .map((r) => ({
      rooms: r.rooms,
      label: roomShortLabel(r.rooms),
      chip: roomChipLabel(r.rooms),
      price: formatPriceFrom(r.priceMin),
    }));
}

function facts(c: ResidentialComplex, cityFallback?: string) {
  const location = realValue(c.district) || realValue(c.address) || cityFallback || 'Анапа';
  const rawCompletion = complexPopularCompletionLine(c) || realValue(c.deadline);
  const completion = /^(строится|сдан|проект)$/i.test(rawCompletion) ? '' : rawCompletion;
  const minPrice = complexMinPrice(c);
  const units = complexTotalUnits(c);
  const status = c.status === 'completed' ? 'Дом сдан' : c.status === 'building' ? 'Строится' : c.status === 'planned' ? 'Старт продаж' : null;
  return {
    location,
    completion,
    price: minPrice != null ? formatPriceFrom(minPrice) : null,
    units,
    unitsLabel: units ? `${units.toLocaleString('ru-RU')} ${pluralRu(units, ['квартира', 'квартиры', 'квартир'])} в продаже` : null,
    status,
    cover: c.images.find((src) => Boolean(src?.trim())),
  };
}

function StatusChip({ children, onPhoto = false }: { children: string; onPhoto?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium leading-none',
        onPhoto ? 'bg-card/95 text-foreground shadow-card backdrop-blur' : 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </span>
  );
}

/** Витрина одного ЖК (или лидера, когда ЖК всего два и меньше места не нужно). */
function ShowcaseCard({ complex, cityFallback, onCoverError }: { complex: ResidentialComplex; cityFallback?: string; onCoverError: () => void }) {
  const f = facts(complex, cityFallback);
  const prices = roomPrices(complex, 4);
  const href = `/complex/${complex.slug}`;

  return (
    <article className="overflow-hidden rounded-card border border-border bg-card shadow-card lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <Link to={href} {...prefetchHandlers('/complex/')} className="group relative block aspect-[16/10] overflow-hidden bg-surface-soft lg:aspect-auto lg:min-h-[440px]" aria-label={`ЖК ${complex.name}`}>
        {f.cover ? (
          <StableMediaFrame
            src={f.cover}
            altContext={complex.name}
            sizes="(min-width: 1024px) 60vw, 100vw"
            loading="eager"
            fetchPriority="high"
            fixedHeightClass="h-full w-full"
            className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onImageError={onCoverError}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
        {f.status ? (
          <span className="absolute left-4 top-4">
            <StatusChip onPhoto>{f.status}</StatusChip>
          </span>
        ) : null}
        {f.unitsLabel ? (
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-white">
            <Home className="h-4 w-4" aria-hidden />
            {f.unitsLabel}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-col p-5 sm:p-6 lg:p-8">
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Новостройка</p>
        <h3 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[30px]">
          <Link to={href} {...prefetchHandlers('/complex/')} className="hover:text-primary">
            {complex.name}
          </Link>
        </h3>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[15px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Локация</dt>
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <dd>{f.location}</dd>
          </div>
          {f.completion ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Срок сдачи</dt>
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
              <dd>Сдача {f.completion}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6">
          <p className="text-[13px] text-muted-foreground">Цена</p>
          <p className="text-price text-[28px] leading-tight text-foreground">{f.price ?? 'Цена по запросу'}</p>
        </div>

        {prices.length > 0 ? (
          <ul className="mt-5 divide-y divide-border/70 border-y border-border/70" aria-label="Цены по комнатности">
            {prices.map((p) => (
              <li key={p.rooms} className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]">
                <span className="text-muted-foreground">{p.label}</span>
                <span className="font-medium tabular-nums text-foreground">{p.price}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row lg:mt-auto lg:pt-6">
          <Link
            to={`${href}#chessboard`}
            {...prefetchHandlers('/complex/')}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Выбрать квартиру
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            to={`${href}#lead`}
            {...prefetchHandlers('/complex/')}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-[15px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Записаться на просмотр
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Плитка для сетки: фото с названием поверх, под фото — цена и цены по комнатности. */
function TileCard({
  complex,
  cityFallback,
  lead = false,
  priority = false,
  onCoverError,
}: {
  complex: ResidentialComplex;
  cityFallback?: string;
  lead?: boolean;
  priority?: boolean;
  onCoverError: () => void;
}) {
  const f = facts(complex, cityFallback);
  const prices = roomPrices(complex, lead ? 4 : 3);

  return (
    <Link
      to={`/complex/${complex.slug}`}
      {...prefetchHandlers('/complex/')}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={cn('relative overflow-hidden bg-surface-soft', lead ? 'aspect-[4/3] lg:aspect-auto lg:flex-1 lg:min-h-[320px]' : 'aspect-[4/3]')}>
        {f.cover ? (
          <StableMediaFrame
            src={f.cover}
            altContext={complex.name}
            sizes={lead ? '(min-width: 1024px) 50vw, 90vw' : '(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 46vw, 86vw'}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            fixedHeightClass="h-full w-full"
            className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onImageError={onCoverError}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" aria-hidden />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {f.status ? <StatusChip onPhoto>{f.status}</StatusChip> : <span />}
          <span className="grid h-8 w-8 place-items-center rounded-full bg-card/95 text-foreground opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-3 text-white">
          <h3 className={cn('line-clamp-1 font-semibold leading-tight tracking-tight', lead ? 'text-[24px]' : 'text-[18px]')}>{complex.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-white/85">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {f.location}
              {f.completion ? ` · сдача ${f.completion}` : ''}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-price text-[19px] leading-tight text-foreground">{f.price ?? 'Цена по запросу'}</p>
          {f.units ? <p className="shrink-0 text-[13px] text-muted-foreground">{f.units.toLocaleString('ru-RU')} кв.</p> : null}
        </div>
        {prices.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Цены по комнатности, от">
            {prices.map((p) => (
              <li key={p.rooms} className="whitespace-nowrap rounded-lg bg-surface-soft px-2 py-1 text-[12.5px] leading-none text-muted-foreground" title={`${p.label} ${p.price}`}>
                <span className="font-medium text-foreground">{p.chip}</span> {p.price.replace(/^от /, '').replace(/ ₽$/, '')}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Link>
  );
}

const PopularComplexesSection = ({ complexes, cityFallback, onCoverError }: Props) => {
  if (complexes.length === 0) return null;
  const count = complexes.length;

  return (
    <section className="container-page section-y" aria-labelledby="popular-title">
      <div className="mb-5 flex items-end justify-between gap-4 lg:mb-7">
        <div>
          <h2 id="popular-title" className="text-section-title">
            Популярные ЖК
          </h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">Актуальные цены и квартиры из выгрузок застройщиков</p>
        </div>
        <Link to="/catalog?type=apartments&market=new" className="inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
          Все ЖК
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {count === 1 ? (
        <ShowcaseCard complex={complexes[0]} cityFallback={cityFallback} onCoverError={() => onCoverError(complexes[0].id)} />
      ) : count === 2 ? (
        <SnapRail label="Популярные жилые комплексы" desktopCols={2} wideCols={2}>
          {complexes.map((c, i) => (
            <TileCard key={c.id} complex={c} cityFallback={cityFallback} lead priority={i === 0} onCoverError={() => onCoverError(c.id)} />
          ))}
        </SnapRail>
      ) : (
        <>
          {/* Телефон и планшет: лента со snap */}
          <div className="lg:hidden">
            <SnapRail label="Популярные жилые комплексы">
              {complexes.map((c, i) => (
                <TileCard key={c.id} complex={c} cityFallback={cityFallback} priority={i === 0} onCoverError={() => onCoverError(c.id)} />
              ))}
            </SnapRail>
          </div>
          {/* Десктоп: лидер 2×2 + сетка */}
          <ul className="hidden gap-5 lg:grid lg:grid-cols-3 xl:grid-cols-4" aria-label="Популярные жилые комплексы">
            {complexes.slice(0, count >= 5 ? 7 : count).map((c, i) => (
              <li key={c.id} className={cn('min-w-0', i === 0 && 'lg:col-span-2 lg:row-span-2')}>
                <TileCard complex={c} cityFallback={cityFallback} lead={i === 0} priority={i === 0} onCoverError={() => onCoverError(c.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default PopularComplexesSection;
