import type { EffectivePromotion, ListingPromotionTier } from '@lg/shared';
import { PROMOTION_BADGE_LABEL } from '@lg/shared';
import { cn } from '@/lib/utils';

type Props = {
  promotion?: EffectivePromotion | null;
  className?: string;
};

export default function PromotionBadge({ promotion, className }: Props) {
  if (!promotion?.isActive || promotion.tier === 'STANDARD') return null;
  const tier = promotion.tier as Exclude<ListingPromotionTier, 'STANDARD'>;
  const label = PROMOTION_BADGE_LABEL[tier] ?? tier;

  const styles =
    tier === 'PREMIUM'
      ? 'bg-warning text-warning-foreground'
      : tier === 'VIP'
        ? 'bg-graphite/85 text-graphite-foreground'
        : 'bg-primary/90 text-primary-foreground';

  return (
    <span
      className={cn(
        'absolute top-1.5 right-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-sm',
        styles,
        className,
      )}
    >
      {label}
    </span>
  );
}
