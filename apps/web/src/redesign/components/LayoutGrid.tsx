import { useState } from 'react';
import { formatArea } from '@/redesign/lib/listing-format';
import { btnClass } from '@/redesign/lib/button-styles';
import { useNavigate } from 'react-router-dom';
import type { LayoutGroup } from '@/redesign/data/types';
import { formatPriceFrom, isPriceFallbackText } from '@/redesign/lib/display-price';
import { getSafeImageUrl, handleImageError, IMAGE_PLACEHOLDER, cachedImageUrl } from '@/redesign/lib/image-media';
import { cardVisual } from '@/redesign/lib/card-visual';
import { cn } from '@/lib/utils';

interface Props {
  layouts: LayoutGroup[];
  complexSlug: string;
}

const LayoutCard = ({ layout }: { layout: LayoutGroup }) => {
  const navigate = useNavigate();
  const canOpen = Boolean(layout.apartmentId);
  const open = () => {
    if (canOpen) navigate(`/apartment/${layout.apartmentId}`);
  };

  return (
    <div
      role="button"
      tabIndex={canOpen ? 0 : -1}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      className={cn(cardVisual.cardShell, 'cursor-pointer hover:shadow-md group')}
    >
      <div className="aspect-square bg-muted/50 flex items-center justify-center p-4 sm:p-6">
        <img
          src={cachedImageUrl(getSafeImageUrl(layout.planImage))}
          alt={`${layout.rooms}-комн`}
          className="max-w-full max-h-full object-contain opacity-60 group-hover:opacity-100 transition-opacity"
          loading="lazy"
          onError={(e) => handleImageError(e, IMAGE_PLACEHOLDER)}
        />
      </div>
      <div className={cn(cardVisual.cardBody, 'gap-1')}>
        <p className={cn(isPriceFallbackText(formatPriceFrom(layout.priceFrom)) ? cardVisual.priceFallback : cardVisual.price)}>
          {formatPriceFrom(layout.priceFrom)}
        </p>
        <h3 className={cardVisual.title}>
          {layout.rooms === 0 ? 'Студия' : `${layout.rooms}-комнатная`}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <p className={cardVisual.metaMuted}>{formatArea(layout.area)}</p>
          <span className={cn(cardVisual.metaMuted, 'font-medium text-foreground/70 shrink-0')}>
            {layout.availableCount} шт.
          </span>
        </div>
      </div>
    </div>
  );
};

/** Сколько планировок видно сразу: у «Мореграда» их 48, и на телефоне блок занимал 6 000+ px */
const INITIAL_VISIBLE = 8;

const LayoutGrid = ({ layouts }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? layouts : layouts.slice(0, INITIAL_VISIBLE);
  const hidden = layouts.length - visible.length;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((l) => (
          <LayoutCard key={l.id} layout={l} />
        ))}
      </div>
      {hidden > 0 ? (
        <button type="button" onClick={() => setExpanded(true)} className={btnClass('secondary', { className: 'mt-4 w-full sm:w-auto' })}>
          Показать все планировки ({layouts.length})
        </button>
      ) : null}
    </div>
  );
};

export default LayoutGrid;
