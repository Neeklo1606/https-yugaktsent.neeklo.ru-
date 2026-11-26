import { formatArea, formatAreaValue } from '@/redesign/lib/listing-format';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Apartment, SortDir, SortField } from '@/redesign/data/types';
import ApartmentTable from '@/redesign/components/ApartmentTable';
import {
  buildRoomCategoryGroups,
  formatGroupPriceRange,
  type RoomCategoryKey,
} from '@/redesign/lib/complex-room-groups';
import { prefersReducedMotion } from '@/redesign/lib/map-sidebar-scroll-utils';

type Props = {
  apartments: Apartment[];
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
};

const ApartmentTypeGroups = ({ apartments, sort, onSort }: Props) => {
  const groups = useMemo(() => buildRoomCategoryGroups(apartments), [apartments]);
  const [openKeys, setOpenKeys] = useState<Set<RoomCategoryKey>>(() => new Set());

  // Auto-open first room category group
  const firstKey = groups[0]?.key ?? null;
  useEffect(() => {
    if (firstKey == null) return;
    setOpenKeys((prev) => {
      if (prev.size > 0) return prev;
      return new Set([firstKey]);
    });
  }, [firstKey]);

  const toggle = (key: RoomCategoryKey) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Свободных квартир нет
      </div>
    );
  }

  const animate = !prefersReducedMotion();

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isOpen = openKeys.has(g.key);
        return (
          <div key={g.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
              aria-expanded={isOpen}
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm">{g.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {g.count} {g.count === 1 ? 'квартира' : g.count < 5 ? 'квартиры' : 'квартир'}
                  {g.areaMin > 0
                    ? ` · ${g.areaMin === g.areaMax ? formatArea(g.areaMin) : `${formatAreaValue(g.areaMin)}–${formatArea(g.areaMax)}`}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium">{formatGroupPriceRange(g.priceMin, g.priceMax)}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200',
                    isOpen && 'rotate-180',
                    !animate && 'transition-none',
                  )}
                />
              </div>
            </button>
            <div
              className={cn(
                'grid border-t border-border',
                animate && 'transition-[grid-template-rows] duration-200 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden min-h-0">
                <div className="p-3 pt-0">
                  <ApartmentTable apartments={g.apartments} sort={sort} onSort={onSort} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ApartmentTypeGroups;
