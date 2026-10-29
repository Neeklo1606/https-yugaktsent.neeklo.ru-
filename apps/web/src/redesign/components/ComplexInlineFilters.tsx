import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SortDir, SortField } from '@/redesign/data/types';
import { ROOM_CATEGORY_DEFS } from '@/redesign/lib/complex-room-groups';

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  roomFilter: number | null;
  onRoomFilter: (rooms: number | null) => void;
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
  buildingOptions?: { id: string; label: string }[];
  activeBuildingId?: string | null;
  onBuildingChange?: (id: string) => void;
  className?: string;
};

export default function ComplexInlineFilters({
  search,
  onSearchChange,
  roomFilter,
  onRoomFilter,
  sort,
  onSort,
  buildingOptions,
  activeBuildingId,
  onBuildingChange,
  className,
}: Props) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}>
      <div className="relative flex-1 min-w-[180px] max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск по № квартиры"
          className="h-9 pl-8 text-xs rounded-lg"
        />
      </div>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0.5">
        <button
          type="button"
          onClick={() => onRoomFilter(null)}
          className={cn(
            'flex h-9 shrink-0 items-center rounded-lg border px-3.5 text-xs font-medium transition-colors',
            roomFilter === null ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50',
          )}
        >
          Все
        </button>
        {ROOM_CATEGORY_DEFS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onRoomFilter(roomFilter === r.key ? null : r.key)}
            className={cn(
              'flex h-9 shrink-0 items-center rounded-lg border px-3.5 text-xs font-medium transition-colors',
              roomFilter === r.key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      {buildingOptions && buildingOptions.length > 1 && onBuildingChange ? (
        <select
          aria-label="Корпус"
          className="h-9 rounded-lg border border-border bg-background px-2 text-base md:text-xs max-w-[200px]"
          value={activeBuildingId ?? ''}
          onChange={(e) => onBuildingChange(e.target.value)}
        >
          {buildingOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex gap-1 sm:ml-auto">
        {(['price', 'area'] as SortField[]).map((field) => (
          <button
            key={field}
            type="button"
            onClick={() => onSort(field)}
            className={cn(
              'flex h-9 items-center rounded-lg border px-3.5 text-xs font-medium transition-colors',
              sort.field === field ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50',
            )}
          >
            {field === 'price' ? 'Цена' : 'Площадь'}
            {sort.field === field ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
