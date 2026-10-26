import { Shield, ShieldCheck, Sparkles, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrustBadgeKind } from '@lg/shared';

export type TrustBadgeView = {
  kind: string;
  label: string;
};

const ICON: Record<string, typeof Shield> = {
  [TrustBadgeKind.VERIFIED_AGENCY]: ShieldCheck,
  [TrustBadgeKind.TRUSTED_AGENT]: Shield,
  [TrustBadgeKind.HIGH_QUALITY_LISTING]: Sparkles,
  [TrustBadgeKind.RECENTLY_VERIFIED]: BadgeCheck,
};

const STYLE: Record<string, string> = {
  [TrustBadgeKind.VERIFIED_AGENCY]: 'bg-accent text-accent-foreground border-primary/20',
  [TrustBadgeKind.TRUSTED_AGENT]: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  [TrustBadgeKind.HIGH_QUALITY_LISTING]: 'bg-surface-soft text-foreground border-border',
  [TrustBadgeKind.RECENTLY_VERIFIED]: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

export default function TrustBadgeRow({
  badges,
  compact = false,
  className,
}: {
  badges: TrustBadgeView[];
  compact?: boolean;
  className?: string;
}) {
  if (!badges.length) return null;

  const visible = badges.slice(0, compact ? 1 : 2);

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {visible.map((b) => {
        const Icon = ICON[b.kind] ?? Shield;
        return (
          <span
            key={b.kind}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border text-[10px] font-medium leading-none',
              compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
              STYLE[b.kind] ?? 'bg-muted text-muted-foreground border-border',
            )}
          >
            <Icon className={cn(compact ? 'w-2.5 h-2.5' : 'w-3 h-3')} aria-hidden />
            {!compact ? <span>{b.label}</span> : null}
          </span>
        );
      })}
    </div>
  );
}
