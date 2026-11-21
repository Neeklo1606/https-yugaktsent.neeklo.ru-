import { CalendarDays, ChevronRight, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResidentialComplex } from '@/redesign/data/types';
import {
  formatDisplayPrice,
  formatPriceFrom,
  isPriceFallbackText,
  isPriceHidden,
  PRICE_ON_REQUEST_CLASS,
  priceAriaLabel,
} from '@/redesign/lib/display-price';
import { CONVERSION_CTA } from '@/redesign/lib/conversion-cta';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { complexPriceBandRows } from '@/redesign/lib/card-visual';
import ObjectPageActionBar from '@/redesign/components/ObjectPageActionBar';

type Props = {
  complex: ResidentialComplex;
  availableCount: number;
  city?: string | null;
  actions: React.ComponentProps<typeof ObjectPageActionBar>['actions'];
  onConsultation: () => void;
  /** Клик по строке «Студии / 1-к.кв …» — фильтр квартир по комнатности */
  onRoomPick?: (rooms: number) => void;
  className?: string;
};

const realValue = (v?: string | null) => (v && v.trim() && v.trim() !== '—' ? v.trim() : '');

function statusText(status: ResidentialComplex['status']): string | null {
  if (status === 'completed') return 'Дом сдан';
  if (status === 'building') return 'Строится';
  if (status === 'planned') return 'Старт продаж';
  return null;
}

export function flatsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'свободная квартира';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'свободные квартиры';
  return 'свободных квартир';
}

/**
 * Первый экран страницы ЖК справа от галереи: всё, что нужно для решения, в одной карточке —
 * название, адрес, статус и срок, цена «от», цены по комнатам (клик фильтрует квартиры),
 * число свободных квартир и действия. Заменила шапку страницы и длинную боковую колонку.
 */
export default function ComplexSummaryCard({
  complex,
  availableCount,
  city,
  actions,
  onConsultation,
  onRoomPick,
  className,
}: Props) {
  const { data: settings } = useSiteSettings();
  const phone = settingOptional(settings, 'phone_main');
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const priceText = formatPriceFrom(complex.priceFrom);
  const bands = complexPriceBandRows(complex);
  const st = statusText(complex.status);
  const deadline = realValue(complex.deadline);
  const showDeadline = deadline && !/^(строится|сдан|проект)$/i.test(deadline);
  const place = [realValue(complex.address) || realValue(complex.district), city && !realValue(complex.address).includes(city) ? city : '']
    .filter(Boolean)
    .join(', ');
  const builder = realValue(complex.builder);

  return (
    <section
      aria-label="Коротко о комплексе"
      className={cn('flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-6', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
            {st ? (
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', complex.status === 'completed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', complex.status === 'completed' ? 'bg-success' : 'bg-primary')} aria-hidden />
                {st}
              </span>
            ) : null}
            {showDeadline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Сдача {deadline}
              </span>
            ) : null}
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{complex.name}</h1>
          {place ? (
            <p className="mt-1.5 flex min-w-0 items-start gap-1.5 text-[14px] text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="line-clamp-2">{place}</span>
            </p>
          ) : null}
        </div>
        <ObjectPageActionBar actions={actions} />
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <p
          className={cn('text-[26px] font-bold leading-none tabular-nums tracking-tight', isPriceFallbackText(priceText) && PRICE_ON_REQUEST_CLASS)}
          aria-label={priceAriaLabel(priceText)}
        >
          {priceText}
        </p>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {availableCount > 0 ? (
            <span className="font-medium text-success">
              {availableCount.toLocaleString('ru-RU')} {flatsWord(availableCount)}
            </span>
          ) : null}
          {availableCount > 0 && !isPriceHidden(complex.priceTo) && complex.priceTo !== complex.priceFrom ? ' · ' : null}
          {!isPriceHidden(complex.priceTo) && complex.priceTo !== complex.priceFrom
            ? formatDisplayPrice(complex.priceTo, { prefix: 'до' })
            : null}
        </p>
      </div>

      {bands.length > 0 ? (
        <ul className="mt-3 -mx-2 space-y-0.5" aria-label="Цены по комнатности">
          {bands.map((row) => (
            <li key={row.rooms}>
              <button
                type="button"
                onClick={() => onRoomPick?.(row.rooms === 21 ? 2 : row.rooms)}
                disabled={!onRoomPick}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[15px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="mb-[4px] min-w-[12px] flex-1 self-end border-b border-dotted border-border" aria-hidden />
                <span className="font-semibold tabular-nums">{row.price}</span>
                {onRoomPick ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {builder ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Застройщик: <span className="font-medium text-foreground">{builder}</span>
        </p>
      ) : null}

      <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-1">
        <Button variant="primary" className="w-full" type="button" onClick={onConsultation}>
          {CONVERSION_CTA.viewing}
        </Button>
        {phoneHref ? (
          <a
            href={phoneHref}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            {phone}
          </a>
        ) : null}
      </div>
    </section>
  );
}
