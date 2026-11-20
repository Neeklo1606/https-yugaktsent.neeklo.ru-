import { useQueries } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import { buildListingsSearchParams } from '@/redesign/lib/catalog-api-params';
import type { CatalogFilters } from '@/redesign/data/types';

const ROOMS: { room: number; label: string }[] = [
  { room: 0, label: 'Студии' },
  { room: 1, label: '1-комн.' },
  { room: 2, label: '2-комн.' },
  { room: 3, label: '3-комн.' },
  { room: 4, label: '4+' },
];

type Props = {
  filters: CatalogFilters;
  regionId: number | null | undefined;
  onChange: (f: CatalogFilters) => void;
  className?: string;
};

/**
 * Быстрые чипы комнат со счётчиками над каталогом (как у Аякса: «Студии 17 · 1-комн. 45»).
 * Счётчик — сколько квартир будет при этой комнатности с остальными текущими фильтрами.
 * Пять лёгких запросов per_page=1; пустые варианты скрываем, выбранный — всегда виден.
 */
export default function CatalogRoomCountChips({ filters, regionId, onChange, className }: Props) {
  const enabled = regionId != null && (filters.objectType === 'apartments' || filters.objectType === 'rooms');
  const base: CatalogFilters = { ...filters, rooms: [] };
  const results = useQueries({
    queries: ROOMS.map(({ room }) => {
      const qs = buildListingsSearchParams({ filters: { ...base, rooms: [room] }, regionId, page: 1, perPage: 1 }).toString();
      return {
        queryKey: ['catalog', 'room-count', qs],
        queryFn: async () => (await apiGet<{ meta?: { total?: number } }>(`/listings?${qs}`)).meta?.total ?? 0,
        enabled,
        staleTime: 60_000,
        placeholderData: (prev: number | undefined) => prev,
      };
    }),
  });
  if (!enabled) return null;

  const toggle = (room: number) =>
    onChange({ ...filters, rooms: filters.rooms.includes(room) ? filters.rooms.filter((r) => r !== room) : [...filters.rooms, room] });

  const chips = ROOMS.map((r, i) => ({ ...r, count: results[i]?.data, on: filters.rooms.includes(r.room) })).filter(
    (c) => c.on || c.count == null || c.count > 0,
  );
  if (chips.length === 0) return null;

  return (
    <div role="group" aria-label="Комнаты" className={cn('-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0', className)}>
      {chips.map((c) => (
        <button
          key={c.room}
          type="button"
          aria-pressed={c.on}
          onClick={() => toggle(c.room)}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] transition-colors',
            c.on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40',
          )}
        >
          {c.label}
          {c.count != null ? <span className="tabular-nums opacity-70">{c.count.toLocaleString('ru-RU')}</span> : null}
        </button>
      ))}
    </div>
  );
}
