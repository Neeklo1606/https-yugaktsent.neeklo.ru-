import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, ArrowUpDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Apartment, SortField, SortDir } from '@/redesign/data/types';
import {
  formatDisplayPrice,
  formatPricePerMeterSafe,
  formatPriceRangeDisplay,
  isPriceFallbackText,
  PRICE_ON_REQUEST_CLASS,
  normalizePriceValue,
  compareByPrice,
} from '@/redesign/lib/display-price';
import MissingPhotoPlaceholder from '@/redesign/components/MissingPhotoPlaceholder';

interface Props {
  apartments: Apartment[];
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
}

type AptStatus = Apartment['status'];

const STATUS_LABEL: Record<AptStatus, string> = {
  available: 'Свободна',
  reserved: 'Бронь',
  sold: 'Продана',
};

const STATUS_CLASS: Record<AptStatus, string> = {
  available: 'text-emerald-600',
  reserved: 'text-warning',
  sold: 'text-muted-foreground line-through',
};

type GroupRow = {
  key: string;
  buildingKey: string;
  buildingLabel: string;
  roomCategory: number;
  apartments: Apartment[];
  areaMin: number;
  areaMax: number;
  priceMin: number;
  priceMax: number;
};

function roomLabel(roomCategory: number): string {
  if (roomCategory === 0) return 'Студия';
  return `${roomCategory}-к. кв.`;
}

function formatAreaRange(min: number, max: number): string {
  if (Math.abs(min - max) < 0.001) return `${min.toLocaleString('ru-RU')} м²`;
  return `${min.toLocaleString('ru-RU')}–${max.toLocaleString('ru-RU')} м²`;
}

function buildingCaption(a: Apartment): string {
  const queue = a.buildingQueue?.trim();
  const name = a.buildingName?.trim();
  if (queue && name) return `${queue} очередь · ${name}`;
  if (queue) return `${queue} очередь`;
  if (name) return name;
  return `Корпус ${a.buildingId}`;
}

function hasPlanPreview(url: string | undefined): boolean {
  if (!url) return false;
  return !url.endsWith('/placeholder.svg');
}

type PreviewState = { url: string; x: number; y: number };

function getPreviewPosition(rect: DOMRect): { x: number; y: number } {
  const pw = 220, ph = 280, gap = 12, pad = 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = rect.right + gap;
  if (x + pw > vw - pad) x = rect.left - pw - gap;
  if (x < pad) x = Math.max(pad, vw - pw - pad);
  let y = rect.top - 8;
  if (y + ph > vh - pad) y = vh - ph - pad;
  if (y < pad) y = pad;
  return { x, y };
}

function sortApartments(apts: Apartment[], sort: { field: SortField; dir: SortDir }): Apartment[] {
  return [...apts].sort((a, b) => {
    const m = sort.dir === 'asc' ? 1 : -1;
    if (sort.field === 'price') return compareByPrice(a.price, b.price, sort.dir);
    if (sort.field === 'area') return (a.area - b.area) * m;
    if (sort.field === 'floor') return (a.floor - b.floor) * m;
    if (sort.field === 'rooms') return (a.rooms - b.rooms) * m;
    if (a.section !== b.section) return (a.section - b.section) * m;
    if (a.floor !== b.floor) return (a.floor - b.floor) * m;
    return ((Number(a.number ?? 0) || 0) - (Number(b.number ?? 0) || 0)) * m;
  });
}

const SortTh = ({
  field,
  label,
  sort,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
  className?: string;
}) => {
  const active = sort.field === field;
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-left cursor-pointer select-none whitespace-nowrap group',
        active && 'text-foreground',
        className,
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={cn(
            'w-3 h-3 transition-opacity',
            active ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-60',
          )}
        />
        {active && (
          <span className="text-[10px] text-primary">
            {sort.dir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </span>
    </th>
  );
};

const ApartmentTable = ({ apartments, sort, onSort }: Props) => {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const grouped = useMemo<GroupRow[]>(() => {
    const groups = new Map<string, GroupRow>();
    for (const a of apartments) {
      const bKey = a.buildingId || 'unknown';
      const bLabel = buildingCaption(a);
      const rKey = `${bKey}:${a.rooms}`;
      const existing = groups.get(rKey);
      if (!existing) {
        groups.set(rKey, {
          key: rKey,
          buildingKey: bKey,
          buildingLabel: bLabel,
          roomCategory: a.rooms,
          apartments: [a],
          areaMin: a.area,
          areaMax: a.area,
          priceMin: a.price,
          priceMax: a.price,
        });
        continue;
      }
      existing.apartments.push(a);
      existing.areaMin = Math.min(existing.areaMin, a.area);
      existing.areaMax = Math.max(existing.areaMax, a.area);
      const p = normalizePriceValue(a.price);
      if (p != null) {
        existing.priceMin = existing.priceMin > 0 ? Math.min(existing.priceMin, p) : p;
        existing.priceMax = Math.max(existing.priceMax, a.price);
      }
    }
    const rows = Array.from(groups.values());
    rows.sort((x, y) => {
      if (x.buildingLabel !== y.buildingLabel) return x.buildingLabel.localeCompare(y.buildingLabel, 'ru');
      return x.roomCategory - y.roomCategory;
    });
    return rows;
  }, [apartments]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  const toggle = (k: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  if (!grouped.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground text-center">
        Квартиры не найдены
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {grouped.map((g) => {
        const isOpen = openKeys.has(g.key);
        const sortedApts = isOpen ? sortApartments(g.apartments, sort) : g.apartments;
        return (
          <div key={g.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1.2fr_1.4fr_auto] gap-2 sm:gap-4 px-4 py-3 text-left items-center hover:bg-muted/20 transition-colors"
              aria-expanded={isOpen}
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm">{roomLabel(g.roomCategory)}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{g.buildingLabel}</div>
              </div>
              <div className="hidden sm:block text-sm text-muted-foreground">
                {formatAreaRange(g.areaMin, g.areaMax)}
              </div>
              <div className="hidden sm:block text-sm font-medium">
                {formatPriceRangeDisplay(g.priceMin, g.priceMax)}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
                <span>{g.apartments.length} кв.</span>
                {isOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </div>
            </button>

            {isOpen ? (
              <div className="border-t border-border">
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-[760px] w-full text-xs">
                    <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-3 py-2.5 text-left w-16">План</th>
                        <th className="px-3 py-2.5 text-left">Корп.</th>
                        <th className="px-3 py-2.5 text-left">Секц.</th>
                        <SortTh field="floor" label="Эт." sort={sort} onSort={onSort} />
                        <th className="px-3 py-2.5 text-left">№ кв.</th>
                        <SortTh field="area" label="Площадь" sort={sort} onSort={onSort} />
                        <th className="px-3 py-2.5 text-left">Кухня</th>
                        <th className="px-3 py-2.5 text-left">Отделка</th>
                        <SortTh field="price" label="Цена" sort={sort} onSort={onSort} />
                        <th className="px-3 py-2.5 text-left">За м²</th>
                        <th className="px-3 py-2.5 text-left">Статус</th>
                        <th className="px-3 py-2.5 text-left w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedApts.map((a, idx) => {
                        const canOpen = a.status !== 'sold';
                        return (
                          <tr
                            key={a.id}
                            className={cn(
                              'border-t border-border/50 transition-colors',
                              idx % 2 === 1 && 'bg-muted/10',
                              canOpen && 'cursor-pointer hover:bg-primary/5',
                              !canOpen && 'opacity-50',
                            )}
                            onClick={() => { if (canOpen) navigate(`/apartment/${a.id}`); }}
                          >
                            <td className="px-3 py-2">
                              {hasPlanPreview(a.planImage) ? (
                                <div
                                  className="w-12 h-12 rounded-md border bg-background overflow-hidden"
                                  onMouseEnter={(e) => {
                                    const pos = getPreviewPosition(e.currentTarget.getBoundingClientRect());
                                    setPreview({ url: a.planImage!, x: pos.x, y: pos.y });
                                  }}
                                  onMouseLeave={() => setPreview((p) => (p?.url === a.planImage ? null : p))}
                                >
                                  <img src={a.planImage} alt="Планировка" className="w-full h-full object-contain" loading="lazy" />
                                </div>
                              ) : (
                                <MissingPhotoPlaceholder className="h-12 w-12 rounded-md border text-[9px]" />
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{a.buildingName || a.buildingId || '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.section}</td>
                            <td className="px-3 py-2">{a.floor}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.number || '—'}</td>
                            <td className="px-3 py-2 font-medium">{a.area} м²</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.kitchenArea ? `${a.kitchenArea} м²` : '—'}</td>
                            <td className="px-3 py-2 capitalize text-muted-foreground">{a.finishing || '—'}</td>
                            <td className={cn('px-3 py-2 font-semibold', isPriceFallbackText(formatDisplayPrice(a.price)) && PRICE_ON_REQUEST_CLASS)}>
                              {formatDisplayPrice(a.price)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatPricePerMeterSafe(a.price, a.area)}
                            </td>
                            <td className={cn('px-3 py-2 text-xs font-medium', STATUS_CLASS[a.status])}>
                              {STATUS_LABEL[a.status]}
                            </td>
                            <td className="px-3 py-2">
                              {canOpen ? (
                                <Link
                                  to={`/apartment/${a.id}`}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted text-primary"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label="Открыть квартиру"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="sm:hidden divide-y divide-border/60">
                  {sortedApts.map((a) => {
                    const canOpen = a.status !== 'sold';
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'flex gap-3 p-3',
                          canOpen && 'cursor-pointer active:bg-muted/20',
                          !canOpen && 'opacity-50',
                        )}
                        onClick={() => { if (canOpen) navigate(`/apartment/${a.id}`); }}
                      >
                        <div className="shrink-0">
                          {hasPlanPreview(a.planImage) ? (
                            <img src={a.planImage} alt="Планировка" className="w-16 h-16 rounded-lg border object-contain bg-background" loading="lazy" />
                          ) : (
                            <MissingPhotoPlaceholder className="w-16 h-16 rounded-lg border text-[9px]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-sm">{a.area} м² · {a.floor} эт.</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {a.kitchenArea ? `Кухня ${a.kitchenArea} м² · ` : ''}{a.finishing || ''}
                              </div>
                            </div>
                            <div className={cn('text-xs font-medium shrink-0', STATUS_CLASS[a.status])}>
                              {STATUS_LABEL[a.status]}
                            </div>
                          </div>
                          <div className={cn('text-sm font-bold mt-1', isPriceFallbackText(formatDisplayPrice(a.price)) && PRICE_ON_REQUEST_CLASS)}>
                            {formatDisplayPrice(a.price)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatPricePerMeterSafe(a.price, a.area)} за м²
                            {a.buildingName ? ` · ${a.buildingName}` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-4 py-2.5 border-t border-border/60 bg-muted/10">
                  <button
                    type="button"
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toggle(g.key)}
                  >
                    Свернуть
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {preview ? (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: `${preview.x}px`, top: `${preview.y}px` }}
        >
          <div className="w-[220px] h-[280px] rounded-2xl border border-border/70 bg-background/95 shadow-[0_12px_40px_rgba(0,0,0,0.18)] p-2 backdrop-blur-sm">
            <img src={preview.url} alt="Планировка" className="w-full h-full object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ApartmentTable;
