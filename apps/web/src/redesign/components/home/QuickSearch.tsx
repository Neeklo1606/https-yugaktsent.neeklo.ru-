import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import { btnClass } from '@/redesign/lib/button-styles';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import CatalogSearchHintsDropdown from '@/redesign/components/CatalogSearchHintsDropdown';
import type { CatalogHints } from '@/redesign/lib/catalog-hints-types';
import { catalogFiltersIntoSearchParams } from '@/redesign/lib/catalog-url-sync';
import { resetFiltersForObjectType } from '@/redesign/lib/catalog-filter-config';
import { useHomeFilterOptions } from '@/redesign/hooks/useHomeFilterOptions';
import { defaultFilters, type CatalogFilters, type MarketType, type ObjectType } from '@/redesign/data/types';

const ROOMS: { room: number; label: string }[] = [
  { room: 0, label: 'Студия' },
  { room: 1, label: '1' },
  { room: 2, label: '2' },
  { room: 3, label: '3' },
  { room: 4, label: '4+' },
];

function toNumber(raw: string): number | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
const fmt = (v?: number) => (v == null ? '' : v.toLocaleString('ru-RU'));

const fieldLabel = 'mb-1.5 block text-[13px] font-medium text-muted-foreground';
const control =
  'h-12 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none transition-[border-color,box-shadow] focus:border-focus focus:ring-[3px] focus:ring-focus/20 lg:h-11 lg:text-[15px]';

/** Пара полей «от — до» для числовых диапазонов */
const RangeInputs = ({
  label,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  onChange: (min?: number, max?: number) => void;
}) => (
  <fieldset>
    <legend className={fieldLabel}>
      {label}
      {unit ? `, ${unit}` : ''}
    </legend>
    <div className="grid grid-cols-2 gap-2">
      <input inputMode="numeric" aria-label={`${label} от`} placeholder="от" className={control} value={fmt(min)} onChange={(e) => onChange(toNumber(e.target.value), max)} />
      <input inputMode="numeric" aria-label={`${label} до`} placeholder="до" className={control} value={fmt(max)} onChange={(e) => onChange(min, toNumber(e.target.value))} />
    </div>
  </fieldset>
);

const RoomChips = ({ value, onToggle }: { value: number[]; onToggle: (room: number) => void }) => (
  <fieldset>
    <legend className={fieldLabel}>Комнаты</legend>
    <div className="flex gap-1.5">
      {ROOMS.map(({ room, label }) => {
        const on = value.includes(room);
        return (
          <button
            key={room}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(room)}
            className={cn(
              'h-12 min-w-0 flex-1 rounded-lg border text-[15px] font-medium transition-colors lg:h-11',
              room === 0 && 'flex-[1.8]',
              on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:border-primary/40',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  </fieldset>
);

/**
 * Быстрый поиск главной. Схема фильтров и query-параметры те же, что у /catalog
 * (catalogFiltersIntoSearchParams), поэтому каталог открывается ровно с выбранным.
 */
const QuickSearch = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CatalogFilters>(() => ({ ...defaultFilters, marketType: 'new' }));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { regionId, regionRows, regionName, setRegionId, markets, types } = useHomeFilterOptions(filters.marketType);

  // Смена рынка или города может сделать текущий тип недоступным — сбрасываем на первый доступный
  useEffect(() => {
    if (types.length && !types.some((t) => t.value === filters.objectType)) {
      setFilters((prev) => resetFiltersForObjectType(prev, types[0].value));
    }
  }, [types, filters.objectType]);

  const deferredSearch = useDeferredValue(filters.search.trim());
  const hintsEnabled = searchFocused && deferredSearch.length >= 2 && regionId != null;
  const { data: hints, isFetching: hintsLoading } = useQuery({
    queryKey: ['search', 'catalog-hints', regionId, deferredSearch],
    queryFn: () =>
      apiGet<CatalogHints>(`/search/catalog-hints?region_id=${regionId}&q=${encodeURIComponent(deferredSearch)}&limit=30`),
    enabled: hintsEnabled,
    staleTime: 20_000,
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const params = useCallback(() => {
    const sp = catalogFiltersIntoSearchParams(new URLSearchParams(), filters);
    if (regionId != null) sp.set('region_id', String(regionId));
    return sp.toString();
  }, [filters, regionId]);

  const go = (path: '/catalog' | '/map') => {
    setSheetOpen(false);
    const q = params();
    navigate(q ? `${path}?${q}` : path);
  };

  const toggleRoom = (room: number) =>
    setFilters((p) => ({ ...p, rooms: p.rooms.includes(room) ? p.rooms.filter((r) => r !== room) : [...p.rooms, room] }));

  const setMarket = (m: MarketType) => setFilters((p) => ({ ...p, marketType: m }));
  const setType = (t: ObjectType) => setFilters((p) => resetFiltersForObjectType(p, t));

  /** Сколько расширенных параметров задано — бейдж на кнопке «Параметры» */
  const extraCount = useMemo(
    () =>
      [filters.priceMin != null || filters.priceMax != null, filters.rooms.length > 0, filters.areaMin != null || filters.areaMax != null, filters.floorMin != null || filters.floorMax != null].filter(Boolean)
        .length,
    [filters],
  );
  const showRoomsAndFloor = filters.objectType === 'apartments' || filters.objectType === 'rooms';

  const locationField =
    regionRows.length > 1 ? (
      <select id="qs-location" aria-label="Локация" className={control} value={regionId ?? ''} onChange={(e) => setRegionId(Number(e.target.value))}>
        {regionRows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    ) : (
      // Один город в данных — выбирать не из чего, показываем честно, без пустого списка
      <div id="qs-location" className={cn(control, 'flex items-center gap-2 bg-surface-soft')} aria-label="Локация">
        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{regionName ?? 'Анапа'}</span>
      </div>
    );

  const typeField =
    types.length > 1 ? (
      <select id="qs-type" aria-label="Тип недвижимости" className={control} value={filters.objectType} onChange={(e) => setType(e.target.value as ObjectType)}>
        {types.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    ) : (
      <div id="qs-type" className={cn(control, 'flex items-center bg-surface-soft')} aria-label="Тип недвижимости">
        <span className="truncate">{types[0]?.label ?? 'Квартиры'}</span>
      </div>
    );

  return (
    <section aria-label="Поиск недвижимости" className="container-page relative z-20 -mt-5 lg:-mt-12">
      <div className="rounded-sheet border border-border bg-card p-3 shadow-raised sm:p-4 lg:p-5">
        {markets.length > 1 ? (
          <div role="tablist" aria-label="Рынок" className="mb-3 inline-flex rounded-lg bg-surface-soft p-1">
            {markets.map((m) => (
              <button
                key={m.value}
                type="button"
                role="tab"
                aria-selected={filters.marketType === m.value}
                onClick={() => setMarket(m.value)}
                className={cn(
                  'h-9 rounded-md px-4 text-[14px] font-medium transition-colors',
                  filters.marketType === m.value ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto] lg:items-end lg:gap-3">
          <div ref={searchRef} className="relative">
            <label htmlFor="qs-search" className={cn(fieldLabel, 'sr-only lg:not-sr-only lg:block')}>
              Поиск
            </label>
            <Search className="pointer-events-none absolute bottom-[15px] left-3 h-[18px] w-[18px] text-muted-foreground lg:bottom-[13px]" aria-hidden />
            <input
              id="qs-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              className={cn(control, 'pl-10')}
              placeholder="ЖК, улица или застройщик"
              value={filters.search}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') go('/catalog');
              }}
            />
            {hintsEnabled ? (
              <CatalogSearchHintsDropdown
                hints={hints}
                isLoading={hintsLoading}
                className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-[min(60vh,420px)] overflow-y-auto"
                onPick={() => {
                  setSearchFocused(false);
                  setFilters((p) => ({ ...p, search: '' }));
                }}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:contents">
            <div>
              <label htmlFor="qs-location" className={fieldLabel}>
                Локация
              </label>
              {locationField}
            </div>
            <div>
              <label htmlFor="qs-type" className={fieldLabel}>
                Тип
              </label>
              {typeField}
            </div>
          </div>

          {/* Цена на десктопе видна сразу; на телефоне — в шторке параметров */}
          <div className="hidden lg:block">
            <RangeInputs label="Цена" unit="₽" min={filters.priceMin} max={filters.priceMax} onChange={(a, b) => setFilters((p) => ({ ...p, priceMin: a, priceMax: b }))} />
          </div>

          <div className="mt-1 flex gap-2 lg:mt-0">
            <button type="button" onClick={() => go('/catalog')} className={btnClass('primary', { className: 'flex-1 lg:flex-none lg:px-6' })}>
              Показать объекты
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label={extraCount ? `Параметры, выбрано: ${extraCount}` : 'Параметры'}
              className={btnClass('secondary', { className: 'relative w-12 shrink-0 !px-0 lg:w-11' })}
            >
              <SlidersHorizontal />
              {extraCount ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                  {extraCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <button type="button" onClick={() => go('/map')} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-1 text-[14px] font-medium text-primary hover:underline underline-offset-4">
            <MapPin className="h-4 w-4" aria-hidden />
            Искать на карте
          </button>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-sheet px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:mx-auto sm:max-w-lg">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader className="text-left">
            <SheetTitle>Параметры</SheetTitle>
            <SheetDescription>Применятся к каталогу и карте.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid gap-5">
            <RangeInputs label="Цена" unit="₽" min={filters.priceMin} max={filters.priceMax} onChange={(a, b) => setFilters((p) => ({ ...p, priceMin: a, priceMax: b }))} />
            {showRoomsAndFloor ? <RoomChips value={filters.rooms} onToggle={toggleRoom} /> : null}
            <RangeInputs label="Площадь" unit="м²" min={filters.areaMin} max={filters.areaMax} onChange={(a, b) => setFilters((p) => ({ ...p, areaMin: a, areaMax: b }))} />
            {showRoomsAndFloor ? (
              <RangeInputs label="Этаж" min={filters.floorMin} max={filters.floorMax} onChange={(a, b) => setFilters((p) => ({ ...p, floorMin: a, floorMax: b }))} />
            ) : null}
            <p className="text-[13px] text-muted-foreground">Срок сдачи, застройщик и статус — в полном фильтре каталога.</p>
          </div>
          <div className="sticky bottom-0 -mx-4 mt-5 flex gap-2 border-t border-border bg-background px-4 pt-3">
            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, priceMin: undefined, priceMax: undefined, rooms: [], areaMin: undefined, areaMax: undefined, floorMin: undefined, floorMax: undefined }))}
              className={btnClass('secondary')}
            >
              Сбросить
            </button>
            <button type="button" onClick={() => go('/catalog')} className={btnClass('primary', { className: 'flex-1' })}>
              Показать объекты
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};

export default QuickSearch;
