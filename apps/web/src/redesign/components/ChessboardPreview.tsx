import { formatArea } from '@/redesign/lib/listing-format';
import { Link } from 'react-router-dom';
import { Building2, ExternalLink, Layers, MapPin } from 'lucide-react';
import type { Apartment } from '@/redesign/data/types';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import { Button } from '@/components/ui/button';
import { formatDisplayPrice, isPriceFallbackText } from '@/redesign/lib/display-price';
import { CHESS_STATUS_LABEL } from '@/redesign/lib/chessboard-status';
import { cn } from '@/lib/utils';

type Props = {
  apartment: Apartment;
  buildingName: string;
  section: number;
  roomLabel: string;
  compact?: boolean;
  onClose?: () => void;
};

const ChessboardPreview = ({
  apartment,
  buildingName,
  section,
  roomLabel,
  compact = false,
  onClose,
}: Props) => {
  const priceDisplay = formatDisplayPrice(apartment.price);
  const canOpen = apartment.status !== 'sold';

  return (
    <div className={cn('flex flex-col gap-3', compact ? 'p-0' : 'p-1')}>
      {!compact ? (
        <StableMediaFrame
          src={apartment.planImage}
          altContext={`План ${roomLabel}, ${formatArea(apartment.area)}`}
          aspect="4/3"
          fallback="branded"
          loading="lazy"
          className="rounded-lg overflow-hidden border border-border"
          imgClassName="object-contain p-3"
        />
      ) : null}

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm">{roomLabel}, {formatArea(apartment.area)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              № {apartment.number || apartment.id}
              {apartment.floor > 0 ? ` · ${apartment.floor} этаж` : ''}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              apartment.status === 'available' && 'bg-green-500/15 text-green-700 dark:text-green-400',
              apartment.status === 'reserved' && 'bg-warning-soft text-warning',
              apartment.status === 'sold' && 'bg-muted text-muted-foreground',
            )}
          >
            {CHESS_STATUS_LABEL[apartment.status]}
          </span>
        </div>

        <p
          className={cn(
            'text-lg font-bold',
            isPriceFallbackText(priceDisplay) ? 'text-muted-foreground' : 'text-primary',
          )}
        >
          {priceDisplay}
        </p>

        <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {buildingName}
            {section > 0 ? ` · секция ${section}` : ''}
          </p>
          {apartment.finishing !== 'без отделки' ? (
            <p className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 shrink-0" />
              {apartment.finishing}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        {canOpen ? (
          <Button size="sm" className="flex-1 h-9" asChild>
            <Link to={`/apartment/${apartment.id}`}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Открыть
            </Link>
          </Button>
        ) : (
          <Button size="sm" className="flex-1 h-9" disabled variant="secondary">
            Продана
          </Button>
        )}
        {onClose ? (
          <Button size="sm" variant="outline" className="h-9" type="button" onClick={onClose}>
            Закрыть
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default ChessboardPreview;

export function ChessboardPreviewInline({
  apartment,
  buildingName,
  section,
}: Omit<Props, 'compact' | 'onClose'>) {
  const roomLabel =
    apartment.rooms === 0 ? 'Студия' : apartment.rooms > 0 ? `${apartment.rooms}-к.кв` : '';
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-border bg-muted">
        <StableMediaFrame
          src={apartment.planImage}
          altContext={roomLabel}
          aspect="none"
          fallback="branded"
          loading="lazy"
          className="h-full w-full"
          imgClassName="object-contain p-1"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">
          {roomLabel}, {formatArea(apartment.area)} · {formatDisplayPrice(apartment.price)}
        </p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          {buildingName}
          {section > 0 ? ` · сек. ${section}` : ''}
          {apartment.floor > 0 ? ` · ${apartment.floor} эт.` : ''}
        </p>
      </div>
    </div>
  );
}
