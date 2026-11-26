import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  buildChessColumns,
  buildChessRows,
  chessColumnGroups,
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

  const columns = useMemo(() => buildChessColumns(matrix), [matrix]);
  const groupHeader = useMemo(() => {
    const g = chessColumnGroups(columns);
    return g.length > 1 ? g : null;
  }, [columns]);

  const CELL = isMobile ? 'h-[48px] w-[70px] rounded-lg' : 'h-[52px] w-[80px] rounded-lg';

  const renderCell = (cell: ChessboardApartmentCell | null, floor: number) => {
    if (!cell) {
      return <div className={cn(CELL, 'border border-dashed border-border/80 bg-transparent')} title="Нет в продаже" aria-hidden />;
    }
    if (cell.status === 'sold') {
      return (
        <div
          className={cn(CELL, 'chess-sold flex flex-col items-center justify-center border border-transparent text-[11px] leading-tight text-muted-foreground')}
          title={`Продана · ${roomLabel(cell.rooms)}, ${fmtArea(cell.area)} м²${cell.number ? ` · № ${cell.number}` : ''}`}
        >
          <span className="font-medium">{shortRooms(cell.rooms)}</span>
          <span className="text-[10px]">продана</span>
        </div>
      );
    }
    const apt = aptById.get(cell.id)!;
    const dim = isDimmed(apt);
    const reserved = cell.status === 'reserved';
    const price = shortChessPrice(cell.price);
    return (
      <div
        role="button"
        tabIndex={dim ? -1 : 0}
        data-apt-id={cell.id}
        aria-label={`${roomLabel(cell.rooms)}${cell.number ? ` № ${cell.number}` : ''}, ${fmtArea(cell.area)} м², ${floor} этаж, ${price || 'цена по запросу'}${reserved ? ', бронь' : ''}`}
        className={cn(
          CELL,
          'group flex cursor-pointer flex-col justify-between border px-2 py-1.5 text-left transition-[transform,border-color,box-shadow,opacity,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          reserved
            ? 'border-amber-400/60 bg-amber-50 hover:border-amber-500 dark:bg-amber-400/10'
            : 'border-primary/25 bg-primary/[0.06] hover:-translate-y-px hover:border-primary hover:bg-primary/[0.12] hover:shadow-md',
          dim && 'opacity-20 hover:translate-y-0',
        )}
      >
        <span className="flex items-baseline justify-between gap-1 leading-none">
          <span className={cn('text-[13px] font-bold', reserved ? 'text-amber-700 dark:text-amber-300' : 'text-primary')}>
            {shortRooms(cell.rooms)}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{fmtArea(cell.area)}</span>
        </span>
        <span className="truncate text-[11px] font-semibold leading-none tabular-nums text-foreground">
          {reserved ? 'бронь' : price || 'по запросу'}
        </span>
      </div>
    );
  };

  const selectClass = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] font-medium';
  const mobilePanel = (
    <div className="space-y-3">
      {groups.length > 1 || (activeGroup && activeGroup.items.length > 1) ? (
        <div className="grid grid-cols-2 gap-2">
          {groups.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted-foreground">Дом</span>
              <select
                className={selectClass}
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
            </label>
          ) : null}
          {activeGroup && activeGroup.items.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted-foreground">Секция</span>
              <select className={selectClass} value={activeId ?? ''} onChange={(e) => onBuildingChange?.(e.target.value)}>
                {activeGroup.items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {onRoomFilter ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide" role="group" aria-label="Комнатность">
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
      ) : null}
    </div>
  );

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

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] lg:block lg:space-y-2" aria-label="Обозначения">
        <li className="flex items-center gap-2">
          <span className="h-4 w-4 rounded border border-primary/30 bg-primary/[0.08]" />
          Свободна <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.available}</span>
        </li>
        {counts.reserved > 0 ? (
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 rounded border border-amber-400/60 bg-amber-50" />
            Бронь <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.reserved}</span>
          </li>
        ) : null}
        {counts.sold > 0 ? (
          <li className="flex items-center gap-2">
            <span className="chess-sold h-4 w-4 rounded" />
            Продана <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.sold}</span>
          </li>
        ) : null}
        {counts.closed > 0 ? (
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 rounded border border-dashed border-border" />
            Нет в продаже <span className="tabular-nums text-muted-foreground lg:ml-auto">{counts.closed}</span>
          </li>
        ) : null}
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
            <div className="max-h-[min(76vh,760px)] overflow-auto overscroll-x-contain p-2 sm:p-3">
              <table className="border-separate border-spacing-[3px]" style={{ minWidth: 'max-content' }}>
                <thead>
                  {groupHeader ? (
                    <tr>
                      <th className="sticky left-0 top-0 z-[3] bg-card" />
                      {groupHeader.map((g, gi) => (
                        <th
                          key={gi}
                          colSpan={g.span + (gi > 0 ? 1 : 0)}
                          className={cn(
                            'sticky top-0 z-[2] bg-card pb-1 text-left text-[12px] font-semibold text-foreground',
                            gi > 0 && 'pl-4',
                          )}
                        >
                          <span className="block border-b border-border pb-1">{g.label || '—'}</span>
                        </th>
                      ))}
                    </tr>
                  ) : null}
                  <tr>
                    <th
                      className={cn(
                        'sticky left-0 z-[3] bg-card pr-1 text-right text-[11px] font-medium text-muted-foreground',
                        groupHeader ? 'top-[30px]' : 'top-0',
                      )}
                    >
                      Этаж
                    </th>
                    {columns.map((c, i) => (
                      <Fragment key={i}>
                        {c.groupStart ? <th aria-hidden className="w-3" /> : null}
                        <th
                          className={cn(
                            'sticky z-[2] bg-card text-center text-[11px] font-normal text-muted-foreground tabular-nums',
                            groupHeader ? 'top-[30px]' : 'top-0',
                          )}
                          title="Номер квартиры на этаже"
                        >
                          {c.label}
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.floor}>
                      <th
                        scope="row"
                        className="sticky left-0 z-[1] w-10 bg-card pr-2 text-right text-[13px] font-semibold text-foreground/70 tabular-nums"
                      >
                        {r.floor}
                      </th>
                      {r.cells.map((cell, i) => (
                        <Fragment key={i}>
                          {columns[i]?.groupStart ? <td aria-hidden className="w-3" /> : null}
                          <td className="p-0">{renderCell(cell, r.floor)}</td>
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">В этом доме нет данных о квартирах</p>
          )}
        </div>
        {isMobile ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-label="Обозначения">
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-primary/30 bg-primary/[0.08]" />Свободна {counts.available}</li>
            {counts.reserved > 0 ? <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-400/60 bg-amber-50" />Бронь {counts.reserved}</li> : null}
            {counts.sold > 0 ? <li className="flex items-center gap-1.5"><span className="chess-sold h-3 w-3 rounded" />Продана {counts.sold}</li> : null}
            {counts.closed > 0 ? <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-border" />Нет в продаже {counts.closed}</li> : null}
          </ul>
        ) : null}
        <p className="mt-2 text-[12px] text-muted-foreground">
          {isMobile ? 'Нажмите на свободную квартиру, чтобы посмотреть планировку.' : 'Наведите на квартиру — покажем планировку, нажмите — откроем её страницу.'}{' '}
          Данные застройщика, обновляются несколько раз в день.
        </p>
      </div>

      <div className="order-1 lg:order-2">{isMobile ? mobilePanel : panel}</div>

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
