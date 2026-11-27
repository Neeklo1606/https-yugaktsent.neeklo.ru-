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
          {layout.availableCount > 1 ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold text-primary" title="Квартир с этой планировкой в продаже">
              ×{layout.availableCount}
            </span>
          ) : null}
        </div>
        {/* Строка есть всегда — карточки одной высоты */}
        <p className={cardVisual.metaMuted}>
          {layout.priceTo && layout.priceTo > layout.priceFrom * 1.02 ? `до ${formatPriceFrom(layout.priceTo).replace(/^от\s*/i, '')}` : '\u00a0'}
        </p>
      </div>
    </div>
  );
};

/** Сколько планировок видно сразу: у «Мореграда» их 48, и на телефоне блок занимал 6 000+ px */
const INITIAL_VISIBLE = 10;

const ROOM_TABS: { key: number | null; label: string }[] = [
  { key: null, label: 'Все' },
  { key: 0, label: 'Студии' },
  { key: 1, label: '1-комн.' },
  { key: 2, label: '2-комн.' },
  { key: 3, label: '3-комн.' },
  { key: 4, label: '4+' },
];

const LayoutGrid = ({ layouts: all }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [rooms, setRooms] = useState<number | null>(null);
  const layouts = rooms === null ? all : all.filter((l) => (rooms >= 4 ? l.rooms >= 4 : l.rooms === rooms));
  const visible = expanded ? layouts : layouts.slice(0, INITIAL_VISIBLE);
  const hidden = layouts.length - visible.length;
  const tabs = ROOM_TABS.filter((t) => t.key === null || all.some((l) => (t.key! >= 4 ? l.rooms >= 4 : l.rooms === t.key)));
  return (
    <div>
      {tabs.length > 2 ? (
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide" role="group" aria-label="Комнатность">
          {tabs.map((t) => {
            const n = t.key === null ? all.length : all.filter((l) => (t.key! >= 4 ? l.rooms >= 4 : l.rooms === t.key)).length;
            const active = rooms === t.key;
            return (
              <button
                key={String(t.key)}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setRooms(t.key);
                  setExpanded(false);
                }}
                className={cn(
                  'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[14px] font-medium transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50',
                )}
              >
                {t.label}
                <span className={cn('tabular-nums', active ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{n}</span>
              </button>
            );
          })}
        </div>
      ) : null}
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
