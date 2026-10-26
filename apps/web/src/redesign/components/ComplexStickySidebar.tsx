import { Link } from 'react-router-dom';
import { Building2, CalendarDays, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResidentialComplex } from '@/redesign/data/types';
import {
  formatPriceFrom,
  formatDisplayPrice,
  isPriceHidden,
  isPriceFallbackText,
  PRICE_ON_REQUEST_CLASS,
  priceAriaLabel,
} from '@/redesign/lib/display-price';
import { CONVERSION_CTA } from '@/redesign/lib/conversion-cta';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import CardDottedPriceRow from '@/redesign/components/CardDottedPriceRow';
import { complexPriceBandRows } from '@/redesign/lib/card-visual';

type Props = {
  complex: ResidentialComplex;
  availableCount: number;
  onConsultation: () => void;
  className?: string;
};

function statusLabel(status: ResidentialComplex['status']): string | null {
  if (status === 'completed') return 'Сдан';
  if (status === 'building') return 'Строится';
  if (status === 'planned') return 'Планируется';
  return null;
}

export default function ComplexStickySidebar({ complex, availableCount, onConsultation, className }: Props) {
  const priceText = formatPriceFrom(complex.priceFrom);
  const st = statusLabel(complex.status);
  const { data: settings } = useSiteSettings();
  const phone = settingOptional(settings, 'phone_main');
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const priceBands = complexPriceBandRows(complex);
  // Когда срок сдачи не заполнен, API отдаёт текст статуса — дубль в панели не нужен
  const rawDeadline = complex.deadline?.trim();
  const deadlineText = rawDeadline && rawDeadline !== '—' && rawDeadline !== st ? rawDeadline : null;

  return (
    <aside
      className={cn(
        'rounded-2xl border border-border/60 bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-4',
        className,
      )}
    >
      <div>
        <p className="text-[13px] text-muted-foreground mb-1 font-medium">Цена от</p>
        <p
          className={cn('text-2xl font-bold tabular-nums leading-tight', isPriceFallbackText(priceText) && PRICE_ON_REQUEST_CLASS)}
          aria-label={priceAriaLabel(priceText)}
        >
          {priceText}
        </p>
        {!isPriceHidden(complex.priceTo) && complex.priceTo !== complex.priceFrom ? (
          <p className="text-xs text-muted-foreground mt-0.5">{formatDisplayPrice(complex.priceTo, { prefix: 'до' })}</p>
        ) : null}
      </div>

      {priceBands.length > 0 ? (
        <div className="border-t border-border/50 pt-3" role="list" aria-label="Цены по типам квартир">
          {priceBands.map((row) => (
            <CardDottedPriceRow key={row.rooms} label={row.label} price={row.price} />
          ))}
        </div>
      ) : null}

      <dl className="space-y-2.5 text-sm border-t border-border/50 pt-4">
        {st ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Статус</dt>
            <dd className="font-medium text-right">{st}</dd>
          </div>
        ) : null}
        {deadlineText ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Сдача
            </dt>
            <dd className="font-medium text-right">{deadlineText}</dd>
          </div>
        ) : null}
        {/* Строку без значения не рисуем: прочерк в карточке ничего не сообщает */}
        {complex.builder && complex.builder !== '—' ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" /> Застройщик
            </dt>
            <dd className="font-medium text-right truncate max-w-[55%]">{complex.builder}</dd>
          </div>
        ) : null}
        {availableCount > 0 ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Свободных кв.</dt>
            <dd className="font-semibold tabular-nums text-success">{availableCount}</dd>
          </div>
        ) : null}
      </dl>

      <div className="space-y-2 pt-0.5">
        {phoneHref ? (
          <a
            href={phoneHref}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <Phone className="h-4 w-4 shrink-0" />
            {phone}
          </a>
        ) : null}
        <Button variant="primary" className="w-full" type="button" onClick={onConsultation}>
          {CONVERSION_CTA.viewing}
        </Button>
        <Button variant="secondary" className="w-full gap-1.5" asChild>
          <Link to={`/presentation/${complex.slug}`}>Презентация PDF</Link>
        </Button>
      </div>
    </aside>
  );
}
