import type { ReactNode } from 'react';
import { formatArea } from '@/redesign/lib/listing-format';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import type { Apartment } from '@/redesign/data/types';
import {
  formatDisplayPrice,
  formatPricePerMeterSafe,
  isPriceFallbackText,
  isPriceHidden,
  priceAriaLabel,
  PRICE_ON_REQUEST_CLASS,
} from '@/redesign/lib/display-price';
import {
  estimateMortgageMonthlyPayment,
  formatRubMonthly,
  MORTGAGE_ESTIMATE_DISCLAIMER,
} from '@/redesign/lib/mortgage-estimate';
import { cn } from '@/lib/utils';
import ObjectPageActionBar from '@/redesign/components/ObjectPageActionBar';

const STATUS_LABEL = {
  available: 'Свободна',
  reserved: 'Бронь',
  sold: 'Продана',
} as const;

const STATUS_CLASS = {
  available: 'bg-green-500/15 text-green-800 dark:text-green-400',
  reserved: 'bg-warning-soft text-warning',
  sold: 'bg-muted text-muted-foreground',
} as const;

const STATUS_DOT = {
  available: 'bg-green-600',
  reserved: 'bg-warning',
  sold: 'bg-muted-foreground',
} as const;

type Props = {
  apartment: Apartment;
  complexName: string;
  complexSlug: string;
  buildingName: string;
  address: string;
  roomLabel: string;
  deadline?: string | null;
  actions?: React.ComponentProps<typeof ObjectPageActionBar>['actions'];
  /** Кнопки «Записаться» / «Позвонить» — внизу карточки */
  cta?: ReactNode;
  className?: string;
};

const realValue = (v?: string | null) => (v && v.trim() && v.trim() !== '—' ? v.trim() : '');

/**
 * Первый экран страницы квартиры справа от планировки (как карточка ЖК):
 * статус и срок, заголовок, ЖК и адрес, цена и цена за метр, короткие факты, действия.
 */
const ApartmentPriceTrust = ({
  apartment,
  complexName,
  complexSlug,
  buildingName,
  address,
  roomLabel,
  deadline,
  actions,
  cta,
  className,
}: Props) => {
  const priceDisplay = formatDisplayPrice(apartment.price);
  const priceHidden = isPriceHidden(apartment.price);
  const ppmDisplay = formatPricePerMeterSafe(apartment.price, apartment.area);
  const ppmHidden = isPriceFallbackText(ppmDisplay);
  const mortgageMonthly = !priceHidden ? estimateMortgageMonthlyPayment({ priceRub: apartment.price }) : null;
  const dl = realValue(deadline);
  const showDeadline = dl && !/^(строится|сдан|проект)$/i.test(dl);
  const addr = realValue(address);

  // Только реальные значения: в фидах ССК нет этажности дома — «5 из 1» не пишем
  const facts = [
    apartment.floor > 0
      ? { label: 'Этаж', value: apartment.totalFloors > apartment.floor ? `${apartment.floor} из ${apartment.totalFloors}` : String(apartment.floor) }
      : null,
    apartment.kitchenArea > 0 ? { label: 'Кухня', value: formatArea(apartment.kitchenArea) } : null,
    realValue(apartment.finishing) ? { label: 'Отделка', value: apartment.finishing } : null,
  ].filter((f): f is { label: string; value: string } => f != null);

  return (
    <section
      id="price"
      aria-label="Коротко о квартире"
      className={cn('flex h-full scroll-mt-32 flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-6', className)}
    >
      {/* На телефоне кнопки 44×44 стоят в строке статуса, а заголовок занимает всю ширину карточки */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn('mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-medium', actions && 'min-h-11 pr-[148px] sm:min-h-0 sm:pr-0')}>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', STATUS_CLASS[apartment.status])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[apartment.status])} aria-hidden />
              {STATUS_LABEL[apartment.status]}
            </span>
            {showDeadline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Сдача {dl}
              </span>
            ) : null}
          </div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">
            {roomLabel}, {formatArea(apartment.area)}
          </h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            <Link to={`/complex/${complexSlug}`} className="font-medium text-foreground transition-colors hover:text-primary">
              ЖК «{complexName}»
            </Link>
            {realValue(buildingName) ? ` · ${buildingName}` : ''}
            {' · '}
            <Link to={`/complex/${complexSlug}?apt=${encodeURIComponent(apartment.id)}#chessboard`} className="font-medium text-primary hover:underline">
              в шахматке
            </Link>
          </p>
          {addr ? (
            <p className="mt-1 flex min-w-0 items-start gap-1.5 text-[14px] text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="line-clamp-2">{addr}</span>
            </p>
          ) : null}
        </div>
        {actions ? <ObjectPageActionBar actions={actions} className="absolute right-0 top-0 sm:static" /> : null}
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <p
          className={cn(
            'text-[30px] font-bold leading-none tabular-nums tracking-tight sm:text-[34px]',
            isPriceFallbackText(priceDisplay) ? PRICE_ON_REQUEST_CLASS : 'text-primary',
          )}
          aria-label={priceAriaLabel(priceDisplay)}
        >
          {priceDisplay}
        </p>
        <p className={cn('mt-1.5 text-[14px]', ppmHidden ? PRICE_ON_REQUEST_CLASS : 'text-muted-foreground')}>{ppmDisplay}</p>
      </div>

      {facts.length > 0 ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0 rounded-xl bg-muted/50 px-3 py-2">
              <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
              <dd className="truncate text-[14px] font-semibold first-letter:uppercase" title={f.value}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {mortgageMonthly != null ? (
        <p className="mt-3 text-[13px] text-muted-foreground" title={MORTGAGE_ESTIMATE_DISCLAIMER}>
          Ипотека от <span className="font-semibold text-foreground">{formatRubMonthly(mortgageMonthly)}</span>
          <span className="ml-1 text-[12px]">· примерный расчёт</span>
        </p>
      ) : null}

      {/* На телефоне те же кнопки уже в нижней липкой панели — в карточке не дублируем */}
      {cta ? <div className="mt-auto hidden pt-5 lg:block">{cta}</div> : null}
    </section>
  );
};

export default ApartmentPriceTrust;
