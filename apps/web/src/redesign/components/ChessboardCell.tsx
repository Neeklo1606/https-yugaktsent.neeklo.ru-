import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { Apartment } from '@/redesign/data/types';
import { formatDisplayPrice } from '@/redesign/lib/display-price';
import {
  CHESS_CELL_CLASS,
  CHESS_STATUS_LABEL,
  resolveChessVisualState,
  type ChessStatusKey,
} from '@/redesign/lib/chessboard-status';

type Props = {
  apartment: Apartment;
  section: number;
  hidden: boolean;
  selected: boolean;
  roomLabel: string;
  onFocus?: () => void;
};

function formatArea(value: number): string {
  return `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м²`;
}

const ChessboardCell = memo(function ChessboardCell({
  apartment,
  section,
  hidden,
  selected,
  roomLabel,
  onFocus,
}: Props) {
  const status = (apartment.status as ChessStatusKey) ?? 'available';
  const visual = resolveChessVisualState(status, { hidden, selected });
  const statusLabel = CHESS_STATUS_LABEL[status];

  return (
    <div
      role="button"
      tabIndex={hidden ? -1 : 0}
      data-apt-id={apartment.id}
      data-section={section}
      data-status={status}
      data-interactive={status !== 'sold' && !hidden ? 'true' : 'false'}
      aria-label={`${roomLabel} № ${apartment.number || apartment.id}, ${formatArea(apartment.area)}, ${formatDisplayPrice(apartment.price)}, ${statusLabel}`}
      onFocus={onFocus}
      className={cn(
        'flex h-[86px] flex-col justify-between rounded-lg border px-2.5 py-2 text-[11px] leading-tight transition-[border-color,box-shadow,opacity] duration-150',
        CHESS_CELL_CLASS[visual],
        status !== 'sold' && !hidden && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-semibold">{roomLabel}</span>
        <span className="shrink-0 tabular-nums">№ {apartment.number || apartment.id}</span>
      </div>
      <div className="text-center">
        <div className="font-semibold">{formatDisplayPrice(apartment.price)}</div>
        <div className="mt-0.5 opacity-80">{statusLabel}</div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="truncate opacity-80">
          {apartment.finishing === 'без отделки' ? '' : apartment.finishing}
        </span>
        <span className="shrink-0 tabular-nums">{formatArea(apartment.area)}</span>
      </div>
    </div>
  );
});

export default ChessboardCell;
