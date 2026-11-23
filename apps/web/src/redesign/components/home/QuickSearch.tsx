import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Map as MapIcon, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import { btnClass } from '@/redesign/lib/button-styles';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PriceRangeField from '@/redesign/components/PriceRangeField';
import CatalogSearchHintsDropdown from '@/redesign/components/CatalogSearchHintsDropdown';
import type { CatalogHints } from '@/redesign/lib/catalog-hints-types';
import { applySmartQuery, hasSmartFilters, parseSmartQuery, smartQueryLabel } from '@/redesign/lib/smart-query';
import { catalogFiltersIntoSearchParams } from '@/redesign/lib/catalog-url-sync';
import { buildListingsSearchParams } from '@/redesign/lib/catalog-api-params';
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
  'h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none transition-[border-color,box-shadow] focus:border-focus focus:ring-[3px] focus:ring-focus/20 lg:h-11 lg:text-[15px]';

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

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Компактные чипы комнат прямо в строке поиска (без подписи) */
const InlineRoomChips = ({ value, onToggle, className }: { value: number[]; onToggle: (room: number) => void; className?: string }) => (
  <div role="group" aria-label="Комнаты" className={cn('flex gap-1', className)}>
    {ROOMS.map(({ room, label }) => {
      const on = value.includes(room);
      return (
        <button
          key={room}
          type="button"
          aria-pressed={on}
          aria-label={room === 0 ? 'Студия' : room === 4 ? '4 комнаты и больше' : `${room}-комнатные`}
          onClick={() => onToggle(room)}
          className={cn(
            'h-10 min-w-10 flex-1 rounded-lg border px-2 text-[14px] font-medium transition-colors lg:h-11 lg:min-w-11 lg:flex-none lg:px-3 lg:text-[15px]',
            room === 0 && 'flex-[1.7] lg:flex-none',
            on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card text-foreground hover:border-primary/40',
          )}
        >
          {label}
        </button>
      );
    })}
  </div>
);

type Variant = 'hero' | 'below';

/**
 * Быстрый поиск главной. Схема фильтров и query-параметры те же, что у /catalog
 * (catalogFiltersIntoSearchParams), поэтому каталог открывается ровно с выбранным.
 *
 * 20.11 (по разбору Аякс/Этажи): компактная карточка, комнаты чипами сразу, живой счётчик на кнопке.
 * variant="hero" — десктоп, по центру баннера; variant="below" — телефон/планшет, под баннером,
 * строка поиска открывает подсказки на весь экран. Оба рендерятся, видимость — CSS (без прыжка при SSR);
 * запрос счётчика общий по ключу, сеть дёргается один раз.
 */
const QuickSearch = ({ variant = 'below' }: { variant?: Variant }) => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CatalogFilters>(() => ({ ...defaultFilters, marketType: 'new' }));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { regionId, regionRows, regionName, setRegionId, markets, types } = useHomeFilterOptions(filters.marketType);

  // Смена рынка или города может сделать текущий тип недоступным — сбрасываем на первый доступный
  useEffect(() => {
    if (types.length && !types.some((t) => t.value === filters.objectType)) {
      setFilters((prev) => resetFiltersForObjectType(prev, types[0].value));
    }
  }, [types, filters.objectType]);

  const deferredSearch = useDeferredValue(filters.search.trim());
  const hintsOpen = variant === 'hero' ? searchFocused : searchSheetOpen;
  const hintsEnabled = hintsOpen && deferredSearch.length >= 2 && regionId != null;
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

  const smartQuery = useMemo(() => parseSmartQuery(deferredSearch), [deferredSearch]);
  const smartHint = hasSmartFilters(smartQuery) ? smartQueryLabel(smartQuery) : null;

  /** Живой счётчик: комнаты, цена, город, тип. Текст поиска не считаем — его разрешают подсказки. */
  const countFilters = useMemo(() => ({ ...applySmartQuery({ ...filters, search: '' }), search: '' }), [filters]);
  const countQs = useMemo(
    () => (regionId != null ? buildListingsSearchParams({ filters: countFilters, regionId, page: 1, perPage: 1 }).toString() : ''),
    [countFilters, regionId],
  );
  const { data: total } = useQuery({
    queryKey: ['home-search', 'count', countQs],
    queryFn: async () => (await apiGet<{ meta?: { total?: number } }>(`/listings?${countQs}`)).meta?.total ?? 0,
    enabled: countQs !== '',
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const params = useCallback(() => {
    // «2к до 8 млн» в строке поиска превращается в фильтры комнат и цены
    const sp = catalogFiltersIntoSearchParams(new URLSearchParams(), applySmartQuery(filters));
    if (regionId != null) sp.set('region_id', String(regionId));
    return sp.toString();
  }, [filters, regionId]);

  const go = (path: '/catalog' | '/map') => {
    setSheetOpen(false);
    setSearchSheetOpen(false);
    let q = params();
    // Кнопка обещает «Показать N квартир» — открываем список квартир, а не ЖК (иначе «284 квартиры» → «3 ЖК»)
    if (path === '/catalog' && isFlats && !filters.search.trim()) {
      const sp = new URLSearchParams(q);
      sp.set('group', 'flats');
      q = sp.toString();
    }
    navigate(q ? `${path}?${q}` : path);
  };

  const toggleRoom = (room: number) =>
    setFilters((p) => ({ ...p, rooms: p.rooms.includes(room) ? p.rooms.filter((r) => r !== room) : [...p.rooms, room] }));

  const setMarket = (m: MarketType) => setFilters((p) => ({ ...p, marketType: m }));
  const setType = (t: ObjectType) => setFilters((p) => resetFiltersForObjectType(p, t));
  const setPrice = (priceMin?: number, priceMax?: number) => setFilters((p) => ({ ...p, priceMin, priceMax }));

  /** Сколько параметров из шторки задано (комнаты видны чипами — их не считаем) */
  const extraCount = useMemo(
    () =>
      [filters.priceMin != null || filters.priceMax != null, filters.areaMin != null || filters.areaMax != null, filters.floorMin != null || filters.floorMax != null].filter(Boolean)
        .length,
    [filters],
  );
  const isFlats = filters.objectType === 'apartments' || filters.objectType === 'rooms';
  const showRoomsAndFloor = isFlats;

  const submitLabel = filters.search.trim()
    ? 'Найти'
    : total == null
      ? 'Показать объекты'
      : total === 0
        ? 'Ничего не найдено'
        : `Показать ${total.toLocaleString('ru-RU')} ${isFlats ? plural(total, 'квартиру', 'квартиры', 'квартир') : plural(total, 'объект', 'объекта', 'объектов')}`;

  const locationField =
    regionRows.length > 1 ? (
      <select id={`qs-location-${variant}`} aria-label="Город" className={cn(control, 'pr-8')} value={regionId ?? ''} onChange={(e) => setRegionId(Number(e.target.value))}>
        {regionRows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    ) : (
      // Один город в данных — выбирать не из чего, показываем честно, без пустого списка
      <div id={`qs-location-${variant}`} className={cn(control, 'flex items-center gap-2 bg-surface-soft')} aria-label="Город">
        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{regionName ?? 'Анапа'}</span>
      </div>
    );

  const typeSelect =
    types.length > 1 ? (
      <select aria-label="Тип недвижимости" className={control} value={filters.objectType} onChange={(e) => setType(e.target.value as ObjectType)}>
        {types.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    ) : null;

  const marketTabs =
    markets.length > 1 ? (
      <div role="tablist" aria-label="Рынок" className="inline-flex rounded-lg bg-surface-soft p-1">
        {markets.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={filters.marketType === m.value}
            onClick={() => setMarket(m.value)}
            className={cn(
              'h-8 rounded-md px-3 text-[14px] font-medium transition-colors',
              filters.marketType === m.value ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    ) : null;

  const paramsButton = (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      aria-label={extraCount ? `Параметры, выбрано: ${extraCount}` : 'Параметры: цена, площадь, этаж'}
      title="Цена, площадь, этаж"
      className={btnClass('secondary', { className: 'relative w-11 shrink-0 !px-0 max-lg:h-10' })}
    >
      <SlidersHorizontal />
      {extraCount ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          {extraCount}
        </span>
      ) : null}
    </button>
  );

  /** short — под баннером на телефоне: «Показать 5 477», полная подпись в aria-label */
  const submitButton = (className?: string, short = false) => (
    <button
      type="button"
      onClick={() => go('/catalog')}
      aria-label={submitLabel}
      className={btnClass('primary', { className: cn('tabular-nums', className) })}
    >
      {short && !filters.search.trim() && total ? `Показать ${total.toLocaleString('ru-RU')}` : submitLabel}
    </button>
  );

  const hintsList = (className: string, expanded = false) => (
    <CatalogSearchHintsDropdown
      expanded={expanded}
      hints={hints}
      isLoading={hintsLoading}
      smart={smartHint ? { label: smartHint, onApply: () => go('/catalog') } : null}
      className={className}
      onPick={() => {
        setSearchFocused(false);
        setSearchSheetOpen(false);
        setFilters((p) => ({ ...p, search: '' }));
      }}
    />
  );

  const paramsSheet = (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-sheet px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:mx-auto sm:max-w-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
        <SheetHeader className="text-left">
          <SheetTitle>Параметры</SheetTitle>
          <SheetDescription>Применятся к каталогу и карте.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid gap-5">
          {typeSelect ? (
            <div>
              <p className={fieldLabel}>Тип</p>
              {typeSelect}
            </div>
          ) : null}
          <PriceRangeField min={filters.priceMin} max={filters.priceMax} onChange={setPrice} inputClassName="h-12 text-base" />
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
          {submitButton('flex-1')}
        </div>
      </SheetContent>
    </Sheet>
  );

  if (variant === 'hero') {
    return (
      <section aria-label="Поиск недвижимости" className="w-full max-w-[920px]">
        <div className="rounded-sheet border border-white/20 bg-card/95 p-3 text-left shadow-raised backdrop-blur-md lg:p-4">
          {marketTabs ? <div className="mb-3">{marketTabs}</div> : null}
          <div className="flex gap-2">
            <div ref={searchRef} className="relative min-w-0 flex-1">
              <label htmlFor="qs-search-hero" className="sr-only">
                Поиск
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="qs-search-hero"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                className={cn(control, 'pl-10')}
                placeholder="ЖК, улица, район или застройщик"
                value={filters.search}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') go('/catalog');
                  if (e.key === 'Escape') setSearchFocused(false);
                }}
              />
              {hintsEnabled ? hintsList('absolute left-0 right-0 top-full z-[60] mt-2 max-h-[min(52vh,420px)] overflow-y-auto shadow-raised') : null}
            </div>
            <div className="w-[190px] shrink-0">{locationField}</div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isFlats ? <InlineRoomChips value={filters.rooms} onToggle={toggleRoom} /> : typeSelect ? <div className="w-48">{typeSelect}</div> : null}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => go('/map')}
                className={btnClass('secondary', { className: 'gap-1.5 px-4' })}
              >
                <MapIcon className="h-4 w-4" aria-hidden />
                Выбрать ЖК на карте
              </button>
              {paramsButton}
              {submitButton('min-w-[220px] px-6')}
            </div>
          </div>
        </div>
        {paramsSheet}
      </section>
    );
  }

  return (
    <section aria-label="Поиск недвижимости" className="container-page relative z-20 -mt-5">
      <div className="rounded-sheet border border-border bg-card p-3 shadow-raised sm:p-4">
        {marketTabs ? <div className="mb-2.5">{marketTabs}</div> : null}
        <div className="flex gap-2">
          {/* Строка поиска — кнопка: подсказки открываются на весь экран, их видно целиком и клавиатура не мешает */}
          <button
            type="button"
            onClick={() => setSearchSheetOpen(true)}
            className={cn(control, 'flex min-w-0 flex-1 items-center gap-2 text-left max-lg:h-10')}
            aria-label={`Поиск: ${filters.search || 'ЖК, улица или застройщик'}`}
          >
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
            <span className={cn('truncate', filters.search ? 'text-foreground' : 'text-muted-foreground')}>
              {filters.search || 'ЖК, улица или застройщик'}
            </span>
          </button>
          {paramsButton}
        </div>
        {isFlats ? <InlineRoomChips value={filters.rooms} onToggle={toggleRoom} className="mt-2" /> : null}
        <div className="mt-2 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
          <div className="[&>*]:h-10 [&>*]:text-[15px]">{locationField}</div>
          {submitButton('h-10 px-3 text-[15px]', true)}
        </div>
        <button
          type="button"
          onClick={() => go('/map')}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[15px] font-medium text-primary transition-colors hover:bg-surface-soft"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Выбрать ЖК на карте
        </button>
      </div>

      <Sheet open={searchSheetOpen} onOpenChange={setSearchSheetOpen}>
        <SheetContent side="bottom" className="flex h-[100svh] flex-col gap-0 rounded-none p-0 [&>button.absolute]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Поиск</SheetTitle>
            <SheetDescription>ЖК, улица, район или застройщик</SheetDescription>
          </SheetHeader>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <button type="button" aria-label="Закрыть поиск" onClick={() => setSearchSheetOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoFocus
                aria-label="Поиск"
                className={cn(control, 'pl-10 pr-10')}
                placeholder="ЖК, улица или застройщик"
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') go('/catalog');
                }}
              />
              {filters.search ? (
                <button
                  type="button"
                  aria-label="Очистить"
                  onClick={() => setFilters((p) => ({ ...p, search: '' }))}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {hintsEnabled ? (
              hintsList('rounded-none border-0 shadow-none', true)
            ) : (
              <p className="px-5 py-6 text-[14px] text-muted-foreground">
                Начните вводить название ЖК, улицу или застройщика. Можно фразой: «2к до 8 млн».
                {regionName ? ` Ищем в городе ${regionName}.` : ''}
              </p>
            )}
          </div>
          <div className="border-t border-border px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{submitButton('w-full')}</div>
        </SheetContent>
      </Sheet>
      {paramsSheet}
    </section>
  );
};

export default QuickSearch;
