import { Link } from 'react-router-dom';
import { GitCompare } from 'lucide-react';
import { COMPARE_ENABLED, useCompare } from '@/shared/hooks/useCompare';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

/** Floating compare shortcut when session has items (mobile-friendly). */
export default function CompareSessionChip({ className }: Props) {
  const { count } = useCompare();
  if (!COMPARE_ENABLED || count <= 0) return null;

  return (
    <Link
      to="/compare"
      className={cn(
        'fixed z-30 bottom-[4.5rem] right-3 lg:bottom-6 lg:right-6',
        'inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/95 backdrop-blur-sm',
        'px-3 py-2 text-xs font-medium shadow-md hover:border-primary/60 transition-colors safe-area-pb',
        className,
      )}
    >
      <GitCompare className="w-4 h-4 text-primary" />
      Сравнение
      <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
        {count}
      </span>
    </Link>
  );
}
