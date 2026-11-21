import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { RotateCcw, X, MapPin, LayoutGrid } from 'lucide-react';
import {
  readSessionSnapshot,
  dismissSessionResume,
  isSessionResumeDismissed,
} from '@/shared/lib/session-continuity';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

export default function SessionResumeBanner({ className }: Props) {
  const [dismissed, setDismissed] = useState(isSessionResumeDismissed);
  const { pathname } = useLocation();

  const snapshot = useMemo(() => readSessionSnapshot(), []);

  if (dismissed || !snapshot) return null;

  const actions: { href: string; label: string; icon: typeof LayoutGrid }[] = [];
  if (snapshot.lastListingHref) {
    actions.push({
      href: snapshot.lastListingHref,
      label: snapshot.lastListingTitle?.trim() || 'Последний объект',
      icon: RotateCcw,
    });
  }
  if (snapshot.catalogHref) {
    actions.push({ href: snapshot.catalogHref, label: 'Каталог', icon: LayoutGrid });
  }
  if (snapshot.mapHref) {
    actions.push({ href: snapshot.mapHref, label: 'Карта', icon: MapPin });
  }

  // Ссылку на страницу, где человек уже находится («Каталог» в каталоге), не показываем
  const visible = actions.filter((a) => a.href.split('?')[0] !== pathname);
  // Без последнего объекта подсказка бесполезна: каталог и карта и так в меню
  if (!snapshot.lastListingHref || !visible.length) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border/70 bg-card py-1.5 pl-3 pr-1 sm:pl-4',
        className,
      )}
    >
      <p className="shrink-0 text-[13px] text-muted-foreground sm:text-sm">Вы недавно смотрели</p>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
        {visible.slice(0, 3).map((a) => {
          const Icon = a.icon;
          return (
          <Link
            key={a.href}
            to={a.href}
            className="inline-flex h-10 min-w-0 max-w-[260px] items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-[13px] font-medium transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Icon className="w-3.5 h-3.5 shrink-0 text-primary" />
            <span className="truncate">{a.label}</span>
          </Link>
          );
        })}
      </div>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center shrink-0 rounded-md text-muted-foreground hover:text-foreground"
        aria-label="Скрыть"
        onClick={() => {
          dismissSessionResume();
          setDismissed(true);
        }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
