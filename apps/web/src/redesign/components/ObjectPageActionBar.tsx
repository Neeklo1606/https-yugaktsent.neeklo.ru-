import { Link } from 'react-router-dom';
import { Heart, Share2, GitCompare, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ActionBtn = {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  active?: boolean;
};

type Props = {
  actions: ActionBtn[];
  className?: string;
};

/** На телефоне — 44×44 (минимальная зона касания), с мыши хватает 36×36 */
const SIZE = 'h-11 w-11 lg:h-9 lg:w-9';

export default function ObjectPageActionBar({ actions, className }: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center gap-1 shrink-0 lg:gap-0.5', className)}>
        {actions.map((a) => (
          <Tooltip key={a.key}>
            <TooltipTrigger asChild>
              {a.href ? (
                <Button variant="outline" size="sm" className={cn(SIZE, 'p-0 rounded-lg border-border/80')} asChild>
                  <Link to={a.href} title={a.label} aria-label={a.label}>
                    {a.icon}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    SIZE,
                    'p-0 rounded-lg border-border/80 transition-colors hover:border-primary/40 hover:bg-primary/5',
                    a.active && 'border-primary/50 bg-primary/10 text-primary',
                  )}
                  disabled={a.disabled}
                  onClick={a.onClick}
                  aria-label={a.label}
                >
                  {a.icon}
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {a.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
