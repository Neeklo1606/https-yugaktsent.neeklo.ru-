import { formatArea } from '@/redesign/lib/listing-format';
import { Link } from 'react-router-dom';
import { Calculator, MapPin } from 'lucide-react';
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

const STATUS_LABEL = {
  available: 'Свободна',
  reserved: 'Бронь',
  sold: 'Продана',
} as const;

const STATUS_CLASS = {
  available: 'bg-green-500/15 text-green-700 dark:text-green-400',
  reserved: 'bg-warning-soft text-warning',
  sold: 'bg-muted text-muted-foreground',
} as const;

type Props = {
  apartment: Apartment;
  complexName: string;
  complexSlug: string;
  buildingName: string;
  address: string;
  roomLabel: string;
};

const ApartmentPriceTrust = ({
  apartment,
  complexName,
  complexSlug,
  buildingName,
  address,
  roomLabel,
}: Props) => {
  const priceDisplay = formatDisplayPrice(apartment.price);
  const priceHidden = isPriceHidden(apartment.price);
  const ppmDisplay = formatPricePerMeterSafe(apartment.price, apartment.area);
  const ppmHidden = isPriceFallbackText(ppmDisplay);

  const mortgageMonthly = !priceHidden
    ? estimateMortgageMonthlyPayment({ priceRub: apartment.price })
    : null;

  return (
    <section id="price" className="scroll-mt-32 rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">
            <Link to={`/complex/${complexSlug}`} className="hover:text-primary transition-colors">
              {complexName}
            </Link>
            {buildingName ? ` · ${buildingName}` : ''}
          </p>
          <p className="text-xl sm:text-2xl font-bold">{roomLabel}, {formatArea(apartment.area)}</p>
          {address ? (
            <p className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
            STATUS_CLASS[apartment.status],
          )}
        >
          {STATUS_LABEL[apartment.status]}
        </span>
      </div>

      <div className="border-t border-border pt-4">
        <p
          className={cn(
            'text-3xl sm:text-4xl font-bold tracking-tight',
            isPriceFallbackText(priceDisplay) ? PRICE_ON_REQUEST_CLASS : 'text-primary',
          )}
          aria-label={priceAriaLabel(priceDisplay)}
        >
          {priceDisplay}
        </p>
        <p
          className={cn(
            'text-sm mt-1',
            ppmHidden ? PRICE_ON_REQUEST_CLASS : 'text-muted-foreground',
          )}
        >
          {ppmDisplay}
        </p>
      </div>

      {mortgageMonthly != null ? (
        <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
          <div className="flex items-start gap-3">
            <Calculator className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Ипотека от {formatRubMonthly(mortgageMonthly)}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {MORTGAGE_ESTIMATE_DISCLAIMER}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default ApartmentPriceTrust;
