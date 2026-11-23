import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Apartment } from '@/redesign/data/types';
import ChessboardPreview from '@/redesign/components/ChessboardPreview';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { chessObsRegisterRender, chessObsSelection } from '@/redesign/lib/chessboard-observability';
import { ROOM_CATEGORY_DEFS, roomCategoryFromRooms, type RoomCategoryKey } from '@/redesign/lib/complex-room-groups';
import type { ChessboardApartmentCell, ChessboardBuildingMatrix } from '@/redesign/lib/chessboard-api';
import {
  buildChessRows,
  countChessCells,
  groupChessBuildings,
  shortChessPrice,
  shortRooms,
  splitBuildingName,
  type ChessBuildingOption,
} from '@/redesign/lib/chessboard-layout';

export type ChessboardBuildingOption = ChessBuildingOption;

interface Props {
  /** Готовая матрица из GET /blocks/:slug/chessboard */
  matrix: ChessboardBuildingMatrix;
  buildingName: string;
  roomFilter?: number | null;
  onRoomFilter?: (key: number | null) => void;
  buildingOptions?: ChessBuildingOption[];
  activeBuildingId?: string | null;
  onBuildingChange?: (id: string) => void;
  isLoading?: boolean;
}

function roomLabel(rooms: number): string {
  if (rooms === 0) return 'Студия';
  if (rooms > 0) return `${rooms}-комн.`;
  return '';
}

function cellToApartment(cell: ChessboardApartmentCell): Apartment {
  return {
    id: cell.id,
    complexId: '',
    buildingId: '',
    rooms: cell.rooms,
    area: cell.area,
    kitchenArea: 0,
    floor: cell.floor,
    totalFloors: 1,
    price: cell.price,
    pricePerMeter: cell.pricePerMeter,
    finishing: cell.finishing as Apartment['finishing'],
    status: cell.status,
    planImage: cell.planImage ?? '',
    section: cell.section,
    number: cell.number,
  };
}

function useIsMobileChess(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

const fmtArea = (v: number) => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 });

const chipClass = (active: boolean) =>
  cn(
    'inline-flex min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-background text-foreground hover:border-primary/50',
  );

/**
 * Шахматка дома: этажи сверху вниз, окна по стоякам. Свободные — белые с ценой,
 * бронь — жёлтые, проданные и окна, которых нет в продаже, — серые.
 * Справа (на телефоне сверху) — выбор литера и секции, комнатности и легенда.
 */
const Chessboard = ({
  matrix,
  buildingName,
  roomFilter = null,
  onRoomFilter,
  buildingOptions,
  activeBuildingId,
  onBuildingChange,
  isLoading = false,
}: Props) => {
  const navigate = useNavigate();
  const isMobile = useIsMobileChess();
  const [hover, setHover] = useState<{ apt: Apartment; rect: DOMRect } | null>(null);
  const [sheetApt, setSheetApt] = useState<Apartment | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewHovered = useRef(false);

  const rows = useMemo(() => buildChessRows(matrix), [matrix]);
  const counts = useMemo(() => countChessCells(rows), [rows]);
  const groups = useMemo(() => groupChessBuildings(buildingOptions ?? []), [buildingOptions]);
  const activeId = activeBuildingId ?? buildingOptions?.[0]?.id ?? null;
  const activeGroup = groups.find((g) => g.items.some((i) => i.id === activeId)) ?? groups[0];
  const { group: titleGroup, section: titleSection } = splitBuildingName(buildingName);

  const roomCounts = useMemo(() => {
    const m = new Map<RoomCategoryKey, number>();
    for (const r of rows)
      for (const c of r.cells)
        if (c && c.status !== 'sold') {
          const k = roomCategoryFromRooms(c.rooms);
          m.set(k, (m.get(k) ?? 0) + 1);
        }
    return m;
  }, [rows]);

  useEffect(() => {
    chessObsRegisterRender({
      apartmentCount: matrix.apartmentCount,
      visibleCellCount: counts.available + counts.reserved,
      sectionCount: 1,
      floorCount: rows.length,
    });
  }, [matrix.apartmentCount, counts, rows.length]);

  const aptById = useMemo(() => {
    const m = new Map<string, Apartment>();
    for (const r of rows) for (const c of r.cells) if (c) m.set(c.id, cellToApartment(c));
    return m;
  }, [rows]);

  const isDimmed = useCallback(
    (apt: Apartment) => roomFilter !== null && roomCategoryFromRooms(apt.rooms) !== roomFilter,
    [roomFilter],
  );

  const clearTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    clearTimer();
    closeTimer.current = setTimeout(() => {
      if (!previewHovered.current) setHover(null);
    }, 160);
  };
  useEffect(() => () => clearTimer(), []);

  const aptFromEvent = (e: React.SyntheticEvent): { apt: Apartment; el: HTMLElement } | null => {
    const el = (e.target as HTMLElement).closest('[data-apt-id]') as HTMLElement | null;
    const apt = el?.dataset.aptId ? aptById.get(el.dataset.aptId) : undefined;
    if (!el || !apt || apt.status === 'sold') return null;
    return { apt, el };
  };

  const onOver = (e: React.MouseEvent) => {
    if (isMobile) return;
    const hit = aptFromEvent(e);
    if (!hit) return scheduleClose();
    clearTimer();
    setHover({ apt: hit.apt, rect: hit.el.getBoundingClientRect() });
  };

  const openApt = (apt: Apartment) => {
    chessObsSelection(apt.id, performance.now());
    if (isMobile) setSheetApt(apt);
    else navigate(`/apartment/${apt.id}`);
  };

  const onClick = (e: React.MouseEvent) => {
    const hit = aptFromEvent(e);
    if (hit) openApt(hit.apt);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hit = aptFromEvent(e);
    if (!hit) return;
    e.preventDefault();
    openApt(hit.apt);
  };

  const previewPos = useMemo(() => {
    if (!hover) return null;
    const W = 280;
    const H = 380;
    let left = hover.rect.right + 8;
    let top = hover.rect.top - 40;
    if (left + W > window.innerWidth - 8) left = hover.rect.left - W - 8;
    if (top + H > window.innerHeight - 8) top = window.innerHeight - H - 8;
    return { left: Math.max(8, left), top: Math.max(8, top) };
  }, [hover]);

  const shaftCount = matrix.shaftCount;
  const hasGrid = rows.length > 0 && shaftCount > 0;

  const panel = (
    <aside className="space-y-3 rounded-2xl border border-border/70 bg-card p-3 sm:p-4 lg:sticky lg:top-24 lg:space-y-4">
      {groups.length > 1 || (activeGroup && activeGroup.items.length > 1) ? (
        <div className="space-y-3">
          {groups.length > 1 ? (
            <div>
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Дом</p>
              {groups.length > 8 ? (
                <select
                  aria-label="Дом"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={activeGroup?.group}
                  onChange={(e) => {
                    const g = groups.find((x) => x.group === e.target.value);
                    if (g?.items[0]) onBuildingChange?.(g.items[0].id);
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.group} value={g.group}>
                      {g.group}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0" role="group" aria-label="Дом">
                  {groups.map((g) => (
                    <button
                      key={g.group}
                      type="button"
                      aria-pressed={g === activeGroup}
                      className={chipClass(g === activeGroup)}
                      onClick={() => g.items[0] && onBuildingChange?.(g.items[0].id)}
                    >
                      {g.group}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {activeGroup && activeGroup.items.length > 1 ? (
            <div>
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Секция</p>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0" role="group" aria-label="Секция">
                {activeGroup.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    aria-pressed={it.id === activeId}
                    className={chipClass(it.id === activeId)}
                    title={`${it.label}: ${it.apartmentCount} в продаже`}
                    onClick={() => onBuildingChange?.(it.id)}
                  >
                    {it.label.replace(/^секция\s*/i, '')}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {onRoomFilter ? (
        <div>
          <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Комнаты</p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0" role="group" aria-label="Комнатность">
            <button type="button" aria-pressed={roomFilter === null} className={chipClass(roomFilter === null)} onClick={() => onRoomFilter(null)}>
              Все
            </button>
            {ROOM_CATEGORY_DEFS.filter((r) => roomCounts.has(r.key)).map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={roomFilter === r.key}
                className={chipClass(roomFilter === r.key)}
                onClick={() => onRoomFilter(roomFilter === r.key ? null : r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] lg:block lg:space-y-1.5" aria-label="Обозначения">
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-primary/40 bg-background" />
          Свободна <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.available}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-amber-500/50 bg-amber-400/30" />
          Бронь <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.reserved}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-border bg-muted" />
          Продана / нет в продаже <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.soldOrClosed}</span>
        </li>
      </ul>
    </aside>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="order-2 min-w-0 lg:order-1">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[16px] font-semibold">
            {titleGroup}
            {titleSection ? <span className="text-muted-foreground"> · {titleSection.toLowerCase()}</span> : null}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{counts.available + counts.reserved}</span> свободно из{' '}
            <span className="tabular-nums">{counts.total}</span> · {rows.length} {rows.length === 1 ? 'этаж' : rows.length < 5 ? 'этажа' : 'этажей'}
          </p>
        </div>

        <div
          role="group"
          aria-label={`Шахматка: ${buildingName}`}
          aria-busy={isLoading}
          onMouseOver={onOver}
          onMouseLeave={scheduleClose}
          onClick={onClick}
          onKeyDown={onKeyDown}
          className={cn('rounded-2xl border border-border/70 bg-card', isLoading && 'pointer-events-none opacity-60')}
        >
          {hasGrid ? (
            <div className="max-h-[min(72vh,720px)] overflow-auto overscroll-x-contain p-2 sm:p-3">
              <table className="border-separate border-spacing-1" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-[3] bg-card text-[10px] font-medium text-muted-foreground">Этаж</th>
                    {Array.from({ length: shaftCount }, (_, i) => (
                      <th key={i} className="sticky top-0 z-[2] bg-card px-1 text-center text-[10px] font-normal text-muted-foreground tabular-nums">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.floor}>
                      <th scope="row" className="sticky left-0 z-[1] w-9 bg-card pr-1 text-right text-[12px] font-medium text-muted-foreground tabular-nums">
                        {r.floor}
                      </th>
                      {r.cells.map((cell, i) => {
                        if (!cell) {
                          return (
                            <td key={i} className="p-0">
                              <div className="h-[52px] w-[78px] rounded-md bg-muted/70" title="Нет в продаже" aria-hidden />
                            </td>
                          );
                        }
                        const apt = aptById.get(cell.id)!;
                        if (cell.status === 'sold') {
                          return (
                            <td key={i} className="p-0">
                              <div
                                className="flex h-[52px] w-[78px] flex-col justify-center rounded-md bg-muted/70 px-1.5 text-[10px] leading-tight text-muted-foreground/80"
                                title={`Продана${cell.number ? ` · № ${cell.number}` : ''}`}
                              >
                                <span className="tabular-nums">
                                  {shortRooms(cell.rooms)} · {fmtArea(cell.area)}
                                </span>
                                <span>продана</span>
                              </div>
                            </td>
                          );
                        }
                        const dim = isDimmed(apt);
                        const reserved = cell.status === 'reserved';
                        return (
                          <td key={i} className="p-0">
                            <div
                              role="button"
                              tabIndex={dim ? -1 : 0}
                              data-apt-id={cell.id}
                              aria-label={`${roomLabel(cell.rooms)}${cell.number ? ` № ${cell.number}` : ''}, ${fmtArea(cell.area)} м², ${r.floor} этаж, ${shortChessPrice(cell.price) || 'цена по запросу'}${reserved ? ', бронь' : ''}`}
                              className={cn(
                                'flex h-[52px] w-[78px] cursor-pointer flex-col justify-between rounded-md border px-1.5 py-1 text-[10px] leading-tight transition-[border-color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                reserved
                                  ? 'border-amber-500/40 bg-amber-400/20 hover:border-amber-600'
                                  : 'border-primary/30 bg-background shadow-sm hover:border-primary hover:shadow-md',
                                dim && 'opacity-25',
                              )}
                            >
                              <span className="flex items-center justify-between gap-1">
                                <span className={cn('rounded px-1 font-semibold', reserved ? 'bg-amber-500/20' : 'bg-primary/10 text-primary')}>
                                  {shortRooms(cell.rooms)}
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                  {cell.number ? `№${cell.number}` : `${fmtArea(cell.area)}`}
                                </span>
                              </span>
                              <span className="truncate text-[11px] font-semibold tabular-nums">
                                {shortChessPrice(cell.price) || 'по запросу'}
                              </span>
                              {cell.number ? (
                                <span className="tabular-nums text-muted-foreground">{fmtArea(cell.area)} м²</span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">В этом доме нет данных о квартирах</p>
          )}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {isMobile ? 'Нажмите на свободную квартиру, чтобы посмотреть планировку.' : 'Наведите на квартиру — покажем планировку, нажмите — откроем её страницу.'}{' '}
          Данные застройщика, обновляются несколько раз в день.
        </p>
      </div>

      <div className="order-1 lg:order-2">{panel}</div>

      {!isMobile && hover && previewPos
        ? createPortal(
            <div
              className="fixed z-[70] w-[280px] rounded-xl border border-border bg-popover p-3 shadow-xl"
              style={{ left: previewPos.left, top: previewPos.top }}
              role="dialog"
              aria-label="Превью квартиры"
              onMouseEnter={() => {
                previewHovered.current = true;
                clearTimer();
              }}
              onMouseLeave={() => {
                previewHovered.current = false;
                scheduleClose();
              }}
            >
              <ChessboardPreview apartment={hover.apt} buildingName={buildingName} section={0} roomLabel={roomLabel(hover.apt.rooms)} />
            </div>,
            document.body,
          )
        : null}

      <Sheet open={sheetApt != null} onOpenChange={(o) => !o && setSheetApt(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-left text-base">Квартира</SheetTitle>
          </SheetHeader>
          {sheetApt ? (
            <ChessboardPreview
              apartment={sheetApt}
              buildingName={buildingName}
              section={0}
              roomLabel={roomLabel(sheetApt.rooms)}
              onClose={() => setSheetApt(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Chessboard;
