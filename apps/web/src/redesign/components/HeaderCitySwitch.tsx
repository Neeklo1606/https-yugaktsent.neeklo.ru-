import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { regionLabel, sortRegionsByName } from '@/redesign/lib/region-picker-utils';

/**
 * Город в шапке, как у ЦИАН: каталог, карта и подборки на главной показывают
 * объекты выбранного города. Пока город один — переключатель не рисуем.
 */
export default function HeaderCitySwitch({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { data: regionId, rows, setStoredRegionId } = useDefaultRegionId();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const regions = sortRegionsByName(rows ?? []);
  if (regions.length < 2) return null;
  const current = regions.find((r) => r.id === regionId);

  const pick = (id: number) => {
    setOpen(false);
    setStoredRegionId(id);
    // Каталог и карта берут город из адреса — переписываем его, чтобы выбор применился сразу
    if (location.pathname.startsWith('/catalog') || location.pathname.startsWith('/map')) {
      const sp = new URLSearchParams(location.search);
      sp.delete('city');
      sp.set('region_id', String(id));
      navigate(`${location.pathname}?${sp.toString()}`, { replace: true });
    }
  };

  if (variant === 'mobile') {
    return (
      <div className="mb-3 flex flex-wrap gap-2 px-1" role="group" aria-label="Город">
        {regions.map((r) => {
          const active = r.id === regionId;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={active}
              onClick={() => pick(r.id)}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:border-primary/40',
              )}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              {regionLabel(r)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Город: ${current ? regionLabel(current) : 'не выбран'}`}
        className="inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-[15px] font-medium text-foreground transition-colors hover:bg-muted hover:text-primary"
      >
        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        {current ? regionLabel(current) : 'Город'}
        <ChevronDown className={cn('hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform xl:block', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <ul role="listbox" aria-label="Город" className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-border bg-popover p-1 shadow-raised">
          {regions.map((r) => {
            const active = r.id === regionId;
            return (
              <li key={r.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => pick(r.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[15px] transition-colors hover:bg-muted',
                    active ? 'font-semibold text-primary' : 'text-foreground',
                  )}
                >
                  {regionLabel(r)}
                  {active ? <Check className="h-4 w-4" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
