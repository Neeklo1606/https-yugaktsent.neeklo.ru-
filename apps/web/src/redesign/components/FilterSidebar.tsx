import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, Search, X, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceRangeField from '@/redesign/components/PriceRangeField';
import type { CatalogFilters, ObjectType, MarketType } from '@/redesign/data/types';
import {
  COMMERCIAL_TYPE_FILTER_OPTIONS,
  DIRECTION_FILTER_OPTIONS,
  getCatalogFilterVisibility,
  HOUSE_MATERIAL_FILTER_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  resetFiltersForObjectType,
  ROOM_LABELS,
} from '@/redesign/lib/catalog-filter-config';

interface Props {
  filters: CatalogFilters;
  onChange: (f: CatalogFilters) => void;
  totalCount: number;
  showMetro?: boolean;
  className?: string;
  districtOptions?: string[];
  subwayOptions?: string[];
  builderOptions?: string[];
  deadlineOptions?: string[];
  objectTypeOptions?: ObjectType[];
  /** When false, hide new-build-specific filters (Срок сдачи, Статус, Застройщик). */
  hasBlocks?: boolean;
  /** Hide «Тип объекта» section (homepage hero uses tabs above). */
  showObjectTypeSwitcher?: boolean;
}

const objectTypes: { value: ObjectType; label: string }[] = [
  { value: 'apartments', label: 'Квартиры' },
  { value: 'rooms', label: 'Комнаты' },
  { value: 'houses', label: 'Дома' },
  { value: 'land', label: 'Участки' },
  { value: 'dachas', label: 'Дачи' },
  { value: 'commercial', label: 'Коммерция' },
];

const marketTypes: { value: MarketType; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новостройки' },
  { value: 'secondary', label: 'Вторичка' },
];

const roomOptions = [0, 1, 2, 3, 4];
const houseRoomOptions = [1, 2, 3, 4];
function prettyDistrict(name: string): string {
  const n = name.trim();
  return n
    .replace(/^ГО\s+/i, '')
    .replace(/^(г\.?\s*)/i, '')
    .replace(/,\s*МО\s*$/i, '')
    .trim();
}

const statusOptions = [
  { value: 'building', label: 'Строится' },
  { value: 'completed', label: 'Сдан' },
  { value: 'planned', label: 'Планируется' },
];

/* --- Collapsible section --- */
const FilterSection = ({
  title,
  children,
  defaultOpen = true,
  count,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" aria-expanded={open} className="flex min-h-11 items-center justify-between w-full py-2 group" onClick={() => setOpen(!open)}>
        <span className="text-[14px] font-semibold text-foreground transition-colors group-hover:text-primary">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold align-middle">
              {count}
            </span>
          )}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-[500px] opacity-100 pb-2' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
};

/* --- Searchable checkbox list --- */
const SearchableCheckboxList = ({
  items,
  selected,
  onToggle,
  placeholder,
  renderLabel,
  searchKey,
}: {
  items: string[];
  selected: string[];
  onToggle: (val: string) => void;
  placeholder: string;
  renderLabel?: (val: string) => React.ReactNode;
  searchKey?: (val: string) => string;
}) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i => (searchKey ? searchKey(i) : i).toLowerCase().includes(q));
  }, [items, search, searchKey]);

  return (
    <div className="space-y-2">
      {items.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            className="pl-8 h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {selected.filter(s => filtered.includes(s)).map(item => (
          <label key={item} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            <Checkbox checked onCheckedChange={() => onToggle(item)} className="w-3.5 h-3.5" />
            {renderLabel ? renderLabel(item) : item}
          </label>
        ))}
        {filtered.filter(i => !selected.includes(i)).map(item => (
          <label key={item} className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Checkbox checked={false} onCheckedChange={() => onToggle(item)} className="w-3.5 h-3.5" />
            {renderLabel ? renderLabel(item) : item}
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-1">Ничего не найдено</p>
        )}
      </div>
    </div>
  );
};

/* --- Main component --- */
const FilterSidebar = ({
  filters,
  onChange,
  totalCount,
  showMetro = true,
  className,
  districtOptions,
  subwayOptions,
  builderOptions,
  deadlineOptions,
  objectTypeOptions,
  hasBlocks = false,
  showObjectTypeSwitcher = true,
}: Props) => {
  // All filter options come exclusively from the API — no mock fallbacks
  const districts = districtOptions ?? [];

  // Metro: shown only when API returns at least one station
  const hasMetro = (subwayOptions?.length ?? 0) > 0;
  const subways = subwayOptions ?? [];

  // Builders: shown only for new buildings and only when API returns at least one builder
  const hasBuilders = (builderOptions?.length ?? 0) > 0;
  const builders = builderOptions ?? [];

  const visibleObjectTypes = objectTypeOptions?.length
    ? objectTypes.filter(o => objectTypeOptions.includes(o.value))
    : objectTypes;

  // Derived flags for conditional filter rendering
  const visibility = getCatalogFilterVisibility(filters.objectType, {
    marketType: filters.marketType,
    hasBlocks,
  });
  const isApartments = filters.objectType === 'apartments';
  const isRooms = filters.objectType === 'rooms';
  const isAptLike = isApartments || isRooms;
  const isLand = filters.objectType === 'land';
  const isHouseLike = filters.objectType === 'houses' || filters.objectType === 'dachas';
  const isCommercial = filters.objectType === 'commercial';
  const isNewBuilding = visibility.deadline;

  const update = useCallback(<K extends keyof CatalogFilters>(key: K, val: CatalogFilters[K]) => {
    onChange({ ...filters, [key]: val });
  }, [filters, onChange]);

  const toggleArray = useCallback((
    key: 'rooms' | 'district' | 'subway' | 'builder' | 'deadline' | 'status' | 'directions' | 'houseLocation' | 'landPurpose' | 'commercialTypes' | 'houseMaterials',
    val: string | number,
  ) => {
    const arr = filters[key] as (string | number)[];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    onChange({ ...filters, [key]: next });
  }, [filters, onChange]);

  const hasFilters = useMemo(() => {
    return filters.rooms.length > 0 || filters.district.length > 0 || filters.subway.length > 0 ||
      filters.builder.length > 0 || filters.deadline.length > 0 ||
      filters.landPurpose.length > 0 || filters.commercialTypes.length > 0 || filters.houseMaterials.length > 0 ||
      filters.directions.length > 0 || filters.houseLocation.length > 0 ||
      filters.status.length > 0 || filters.search !== '' ||
      filters.priceMin !== undefined || filters.priceMax !== undefined ||
      filters.areaMin !== undefined || filters.areaMax !== undefined ||
      filters.landAreaMin !== undefined || filters.landAreaMax !== undefined ||
      filters.distanceMin !== undefined || filters.distanceMax !== undefined ||
      filters.floorMin !== undefined || filters.floorMax !== undefined;
  }, [filters]);

  const activeTags = useMemo(() => {
    const tags: { label: string; clear: () => void }[] = [];
    filters.rooms.forEach(r => tags.push({ label: ROOM_LABELS[r] || `${r}к`, clear: () => toggleArray('rooms', r) }));
    filters.district.forEach(d => tags.push({ label: prettyDistrict(d), clear: () => toggleArray('district', d) }));
    filters.subway.forEach(s => tags.push({ label: `м. ${s}`, clear: () => toggleArray('subway', s) }));
    filters.builder.forEach(b => tags.push({ label: b, clear: () => toggleArray('builder', b) }));
    filters.landPurpose.forEach(p => tags.push({ label: p, clear: () => toggleArray('landPurpose', p) }));
    filters.commercialTypes.forEach(t => {
      const opt = COMMERCIAL_TYPE_FILTER_OPTIONS.find(o => o.value === t);
      tags.push({ label: opt?.label || t, clear: () => toggleArray('commercialTypes', t) });
    });
    filters.houseMaterials.forEach(m => tags.push({ label: m, clear: () => toggleArray('houseMaterials', m) }));
    filters.directions.forEach(d => {
      const opt = DIRECTION_FILTER_OPTIONS.find(o => o.value === d);
      tags.push({ label: opt?.label || d, clear: () => toggleArray('directions', d) });
    });
    filters.status.forEach(s => {
      const opt = statusOptions.find(o => o.value === s);
      tags.push({ label: opt?.label || s, clear: () => toggleArray('status', s) });
    });
    if (filters.priceMin) tags.push({ label: `от ${(filters.priceMin / 1e6).toFixed(1)} млн`, clear: () => update('priceMin', undefined) });
    if (filters.priceMax) tags.push({ label: `до ${(filters.priceMax / 1e6).toFixed(1)} млн`, clear: () => update('priceMax', undefined) });
    if (filters.areaMin) tags.push({ label: `от ${filters.areaMin} ${isLand ? 'сот.' : 'м²'}`, clear: () => update('areaMin', undefined) });
    if (filters.areaMax) tags.push({ label: `до ${filters.areaMax} ${isLand ? 'сот.' : 'м²'}`, clear: () => update('areaMax', undefined) });
    if (filters.landAreaMin) tags.push({ label: `участок от ${filters.landAreaMin} сот.`, clear: () => update('landAreaMin', undefined) });
    if (filters.landAreaMax) tags.push({ label: `участок до ${filters.landAreaMax} сот.`, clear: () => update('landAreaMax', undefined) });
    if (filters.distanceMin) tags.push({ label: `расстояние от ${filters.distanceMin} км`, clear: () => update('distanceMin', undefined) });
    if (filters.distanceMax) tags.push({ label: `расстояние до ${filters.distanceMax} км`, clear: () => update('distanceMax', undefined) });
    if (filters.floorMin) tags.push({ label: `этаж от ${filters.floorMin}`, clear: () => update('floorMin', undefined) });
    if (filters.floorMax) tags.push({ label: `этаж до ${filters.floorMax}`, clear: () => update('floorMax', undefined) });
    return tags;
  }, [filters, toggleArray, update, isLand]);

  const resetAll = useCallback(() => {
    onChange({
      objectType: filters.objectType, marketType: 'all',
      rooms: [], district: [], subway: [], builder: [],
      deadline: [], status: [], search: '',
      landPurpose: [], commercialTypes: [], houseMaterials: [],
      priceMin: undefined, priceMax: undefined,
      areaMin: undefined, areaMax: undefined,
      landAreaMin: undefined, landAreaMax: undefined,
      distanceMin: undefined, distanceMax: undefined,
      floorMin: undefined, floorMax: undefined,
      directions: [], houseLocation: [],
    });
  }, [onChange, filters.objectType]);

  return (
    <div className={cn('space-y-0', className)}>
      {/* Active tags */}
      {activeTags.length > 0 && (
        <div className="pb-2 mb-0.5 border-b border-border">
          <div className="flex flex-wrap gap-1 min-w-0">
          {activeTags.map((tag, i) => (
            <button
              key={i}
              onClick={tag.clear}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors max-w-full min-w-0"
              title={tag.label}
            >
              <span className="truncate">{tag.label}</span>
              <X className="w-2.5 h-2.5" />
            </button>
          ))}
          </div>
          <button
            onClick={resetAll}
            className="mt-2 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
          >
            Очистить все
          </button>
        </div>
      )}

      {/* 1. Тип объекта */}
      {showObjectTypeSwitcher && (
      <FilterSection title="Тип объекта" count={0}>
        <div className="flex flex-wrap gap-1">
          {visibleObjectTypes.map(t => (
            <button
              key={t.value}
              onClick={() => {
                if (t.value === filters.objectType) return;
                onChange(resetFiltersForObjectType(filters, t.value));
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                filters.objectType === t.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-background hover:border-primary/50'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Sub-filter: Новостройки / Вторичка */}
        {visibility.marketType && (
          <div className="flex gap-1 mt-2 pt-2 border-t border-border/50">
            {marketTypes.map(t => (
              <button
                key={t.value}
                onClick={() => update('marketType', t.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                  filters.marketType === t.value
                    ? 'bg-accent text-accent-foreground border-primary/30'
                    : 'border-border bg-background hover:border-primary/50 text-muted-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </FilterSection>
      )}

      <FilterSection title="Цена, ₽" count={filters.priceMin || filters.priceMax ? 1 : 0}>
        <PriceRangeField
          hideLabel
          min={filters.priceMin}
          max={filters.priceMax}
          inputClassName="h-10 pl-7 pr-2 text-[13px]"
          onChange={(from, to) => onChange({ ...filters, priceMin: from, priceMax: to })}
        />
      </FilterSection>

      {/* 4. Комнатность — only for apartments */}
      {visibility.rooms && (
        <FilterSection title="Комнатность" count={filters.rooms.length}>
          <div className="flex gap-1">
            {roomOptions.map(r => (
              <button
                key={r}
                onClick={() => toggleArray('rooms', r)}
                className={cn(
                  'h-8 flex-1 rounded-lg text-xs font-medium border transition-colors',
                  filters.rooms.includes(r)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-foreground hover:border-primary/50'
                )}
              >
                {ROOM_LABELS[r]}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {visibility.houseRooms && (
        <FilterSection title="Кол-во комнат" count={filters.rooms.length}>
          <div className="flex gap-1">
            {houseRoomOptions.map(r => (
              <button
                key={r}
                onClick={() => toggleArray('rooms', r)}
                className={cn(
                  'h-8 flex-1 rounded-lg text-xs font-medium border transition-colors',
                  filters.rooms.includes(r)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-foreground hover:border-primary/50'
                )}
              >
                {ROOM_LABELS[r]}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* 5. Площадь — label adapts by object type */}
      <FilterSection
        title={
          isLand
            ? 'Площадь, сот.'
            : isHouseLike
              ? 'Площадь дома, м²'
              : isCommercial
                ? 'Площадь, м²'
                : 'Площадь, м²'
        }
        defaultOpen={false}
        count={filters.areaMin || filters.areaMax ? 1 : 0}
      >
        <div className="flex gap-2">
          <Input type="number" placeholder="от" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.areaMin ?? ''} onChange={e => update('areaMin', e.target.value ? Number(e.target.value) : undefined)} />
          <Input type="number" placeholder="до" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.areaMax ?? ''} onChange={e => update('areaMax', e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </FilterSection>

      {isHouseLike && (
        <>
          <FilterSection title="Площадь участка, сот." defaultOpen={false} count={filters.landAreaMin || filters.landAreaMax ? 1 : 0}>
            <div className="flex gap-2">
              <Input type="number" placeholder="от" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.landAreaMin ?? ''} onChange={e => update('landAreaMin', e.target.value ? Number(e.target.value) : undefined)} />
              <Input type="number" placeholder="до" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.landAreaMax ?? ''} onChange={e => update('landAreaMax', e.target.value ? Number(e.target.value) : undefined)} />
            </div>
          </FilterSection>

          {visibility.distance && (
          <FilterSection title="Расстояние до города, км" defaultOpen={false} count={filters.distanceMin || filters.distanceMax ? 1 : 0}>
            <div className="flex gap-2">
              <Input type="number" placeholder="от" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.distanceMin ?? ''} onChange={e => update('distanceMin', e.target.value ? Number(e.target.value) : undefined)} />
              <Input type="number" placeholder="до" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.distanceMax ?? ''} onChange={e => update('distanceMax', e.target.value ? Number(e.target.value) : undefined)} />
            </div>
          </FilterSection>
          )}

          {visibility.directions && (
          <FilterSection title="Направление" defaultOpen={false} count={filters.directions.length}>
            <div className="space-y-1.5">
              {DIRECTION_FILTER_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer text-xs hover:text-foreground transition-colors">
                  <Checkbox checked={filters.directions.includes(option.value)} onCheckedChange={() => toggleArray('directions', option.value)} className="w-3.5 h-3.5" />
                  {option.label}
                </label>
              ))}
            </div>
          </FilterSection>
          )}

          {visibility.houseMaterial && (
          <FilterSection title="Материал" defaultOpen={false} count={filters.houseMaterials.length}>
            <div className="flex flex-wrap gap-1">
              {HOUSE_MATERIAL_FILTER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleArray('houseMaterials', option.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                    filters.houseMaterials.includes(option.value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-background hover:border-primary/50',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FilterSection>
          )}

        </>
      )}

      {visibility.landPurpose && (
        <FilterSection title="Назначение" defaultOpen={false} count={filters.landPurpose.length}>
          <div className="flex flex-wrap gap-1">
            {LAND_PURPOSE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleArray('landPurpose', option.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                  filters.landPurpose.includes(option.value)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-background hover:border-primary/50',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {visibility.commercialType && (
        <FilterSection title="Тип" defaultOpen={false} count={filters.commercialTypes.length}>
          <div className="flex flex-wrap gap-1">
            {COMMERCIAL_TYPE_FILTER_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleArray('commercialTypes', option.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                  filters.commercialTypes.includes(option.value)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-background hover:border-primary/50',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* 6. Этаж — only for apartments */}
      {visibility.floor && (
        <FilterSection title="Этаж" defaultOpen={false} count={filters.floorMin || filters.floorMax ? 1 : 0}>
          <div className="flex gap-2">
            <Input type="number" placeholder="от" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.floorMin ?? ''} onChange={e => update('floorMin', e.target.value ? Number(e.target.value) : undefined)} />
            <Input type="number" placeholder="до" className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 focus-visible:border-primary" value={filters.floorMax ?? ''} onChange={e => update('floorMax', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        </FilterSection>
      )}

      {/* 7. Срок сдачи — only for new apartments with deadline options available */}
      {visibility.deadline && (deadlineOptions?.length ?? 0) > 0 && (
        <FilterSection title="Срок сдачи" defaultOpen={false} count={filters.deadline.length}>
          <div className="flex flex-wrap gap-1">
            {(deadlineOptions ?? []).map(d => (
              <button
                key={String(d).replace(/Q/gi, 'к')}
                onClick={() => toggleArray('deadline', d)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                  filters.deadline.includes(d)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:border-primary/50'
                )}
              >
                {String(d).replace(/Q/gi, 'к')}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* 9. Статус — only for new apartments */}
      {isNewBuilding && (
        <FilterSection title="Статус" defaultOpen={false} count={filters.status.length}>
          <div className="space-y-1.5">
            {statusOptions.map(s => (
              <label key={s.value} className="flex items-center gap-2 cursor-pointer text-xs hover:text-foreground transition-colors">
                <Checkbox checked={filters.status.includes(s.value)} onCheckedChange={() => toggleArray('status', s.value)} className="w-3.5 h-3.5" />
                {s.label}
              </label>
            ))}
          </div>
        </FilterSection>
      )}

      {/* 10. Район: глобального фильтра по районам в ТЗ нет (вместо него — «Локация»-город).
          Показываем, только если район уже пришёл в ссылке — чтобы его можно было снять */}
      {districts.length > 0 && filters.district.length > 0 && (
        <FilterSection title="Район" defaultOpen={false} count={filters.district.length}>
          <SearchableCheckboxList
            items={districts}
            selected={filters.district}
            onToggle={val => toggleArray('district', val)}
            placeholder="Найти район..."
            renderLabel={prettyDistrict}
            searchKey={prettyDistrict}
          />
        </FilterSection>
      )}

      {/* 11. Метро — apartments/rooms, Moscow only */}
      {visibility.metro && showMetro && hasMetro && (
        <FilterSection title="Метро" defaultOpen={false} count={filters.subway.length}>
          <SearchableCheckboxList
            items={subways}
            selected={filters.subway}
            onToggle={val => toggleArray('subway', val)}
            placeholder="Найти станцию..."
          />
        </FilterSection>
      )}

      {/* 12. Застройщик — only for new buildings, and only if region has builders */}
      {visibility.builder && hasBuilders && (
        <FilterSection title="Застройщик" defaultOpen={false} count={filters.builder.length}>
          <SearchableCheckboxList
            items={builders}
            selected={filters.builder}
            onToggle={val => toggleArray('builder', val)}
            placeholder="Найти застройщика..."
          />
        </FilterSection>
      )}

      {/* Actions */}
      <div className="pt-3 space-y-2">
        <Link
          to="/map"
          className="flex items-center justify-center gap-2 w-full h-9 rounded-xl border border-border bg-background text-xs font-medium hover:bg-secondary transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 text-primary" />
          Показать на карте
        </Link>
        {hasFilters && (
          <button
            onClick={resetAll}
            className="flex items-center justify-center gap-1.5 w-full h-8 rounded-xl text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3" /> Сбросить все фильтры
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterSidebar;
