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
  chessLiterals,
  countChessCells,
  deadlineQuarter,
  mergeLiteralMatrix,
  shortChessPrice,
  shortRooms,
} from '@/redesign/lib/chessboard-layout';

interface Props {
  /** Все корпуса/секции из GET /blocks/:slug/chessboard */
  boards: ChessboardBuildingMatrix[];
  activeBuildingId: string | null;
  onBuildingChange: (id: string) => void;
  roomFilter?: number | null;
  onRoomFilter?: (key: number | null) => void;
  isLoading?: boolean;
  /** Заявка на квартиру из превью: подпись квартиры (видна в форме) и id объявления */
  onApartmentLead?: (summary: string, listingId: string) => void;
  /** Квартира, к которой прокрутить и подсветить (переход со страницы квартиры) */
  highlightId?: string | null;
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
    finishing: (cell.finishing === '—' ? '' : cell.finishing) as Apartment['finishing'],
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
const fmtInt = (v: number) => v.toLocaleString('ru-RU');

/** Цвет бейджа комнатности — как у застройщиков: глазом видно, где студии, где «двушки» */
const ROOM_BADGE: Record<number, string> = {
  0: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  1: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  2: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  3: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
};
const roomBadge = (rooms: number) => ROOM_BADGE[Math.min(Math.max(rooms, 0), 3)] ?? ROOM_BADGE[3];
const roomBadgeBig = 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200';


const leadSummary = (a: Apartment, where: string) =>
  `${roomLabel(a.rooms)}${a.number ? ` № ${a.number}` : ''}, ${fmtArea(a.area)} м², ${a.floor} этаж, ${where}`;

const chipClass = (active: boolean) =>
  cn(
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-3 text-[14px] font-medium transition-colors',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:border-primary/50',
  );

const label = (t: string) => <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</p>;

/**
 * Шахматка литера целиком, как у застройщика: секции рядом слева направо, этажи сверху вниз,
 * окна по стоякам. Сверху — выбор дома (со сроком сдачи), секции, комнатности и подсветка цены.
 * Свободные — с ценой, бронь — жёлтые, проданные — серой штриховкой, «нет в продаже» — пунктир.
 */
const Chessboard = ({ boards, activeBuildingId, onBuildingChange, roomFilter = null, onRoomFilter, isLoading = false, onApartmentLead, highlightId = null }: Props) => {
  const navigate = useNavigate();
  const isMobile = useIsMobileChess();
  const [hover, setHover] = useState<{ apt: Apartment; rect: DOMRect; where: string } | null>(null);
  const [sheetApt, setSheetApt] = useState<{ apt: Apartment; where: string } | null>(null);
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewHovered = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const updateEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  const literals = useMemo(() => chessLiterals(boards), [boards]);
  const merged = useMemo(() => mergeLiteralMatrix(boards, activeBuildingId), [boards, activeBuildingId]);
  const matrix = merged?.matrix ?? null;
  const rows = useMemo(() => (matrix ? buildChessRows(matrix) : []), [matrix]);
  const columns = useMemo(() => (matrix ? buildChessColumns(matrix) : []), [matrix]);
  const sectionsList = merged?.sections ?? [];
  /** Окно вне этажей своей секции (секции литера бывают разной высоты) — рисуем пустоту */
  const isOutside = useCallback(
    (floor: number, col: number) => {
      const s = sectionsList.find((x) => col >= x.colStart && col < x.colStart + x.colCount);
      return Boolean(s && sectionsList.length > 1 && (floor > s.maxFloor || floor < s.minFloor));
    },
    [sectionsList],
  );
  const counts = useMemo(() => countChessCells(rows, isOutside), [rows, isOutside]);
  const secOfCol = useCallback(
    (col: number) => sectionsList.find((x) => col >= x.colStart && col < x.colStart + x.colCount) ?? null,
    [sectionsList],
  );
  const topFloor = rows.length ? rows[0].floor : 0;
  const groupHeader = useMemo(() => {
    const g = chessColumnGroups(columns);
    return g.length > 1 ? g : null;
  }, [columns]);
  const hasNumbers = useMemo(() => rows.some((r) => r.cells.some((c) => c?.number)), [rows]);
  const sections = sectionsList;
  const literalName = merged?.group ?? '';
  const activeLiteral = literals.find((l) => l.group === literalName);

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
    if (!matrix) return;
    chessObsRegisterRender({
      apartmentCount: matrix.apartmentCount,
      visibleCellCount: counts.available + counts.reserved,
      sectionCount: sections.length,
      floorCount: rows.length,
    });
  }, [matrix, counts, rows.length, sections.length]);

  // Смена дома — сетка в начало
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0 });
    setFocusSection(null);
    requestAnimationFrame(updateEdge);
  }, [literalName, updateEdge, columns.length]);

  const aptById = useMemo(() => {
    const m = new Map<string, { apt: Apartment; where: string }>();
    for (const r of rows)
      r.cells.forEach((c, i) => {
        if (c) m.set(c.id, { apt: cellToApartment(c), where: columns[i]?.group ? `${literalName} · ${columns[i].group}` : literalName });
      });
    return m;
  }, [rows, columns, literalName]);

  const isDimmed = useCallback(
    (rooms: number) => roomFilter !== null && roomCategoryFromRooms(rooms) !== roomFilter,
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

  const hitFromEvent = (e: React.SyntheticEvent) => {
    const el = (e.target as HTMLElement).closest('[data-apt-id]') as HTMLElement | null;
    const hit = el?.dataset.aptId ? aptById.get(el.dataset.aptId) : undefined;
    if (!el || !hit || hit.apt.status === 'sold') return null;
    return { ...hit, el };
  };

  const onOver = (e: React.MouseEvent) => {
    if (isMobile) return;
    const hit = hitFromEvent(e);
    if (!hit) return scheduleClose();
    clearTimer();
    setHover({ apt: hit.apt, rect: hit.el.getBoundingClientRect(), where: hit.where });
  };

  const openApt = (hit: { apt: Apartment; where: string }) => {
    chessObsSelection(hit.apt.id, performance.now());
    if (isMobile) setSheetApt(hit);
    else navigate(`/apartment/${hit.apt.id}`);
  };
  const onClick = (e: React.MouseEvent) => {
    const hit = hitFromEvent(e);
    if (hit) openApt(hit);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hit = hitFromEvent(e);
    if (!hit) return;
    e.preventDefault();
    openApt(hit);
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

  // Переход со страницы квартиры: прокручиваем сетку к её ячейке
  const highlightDone = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId || highlightDone.current === highlightId) return;
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-apt-id="${CSS.escape(highlightId)}"]`);
    if (!box || !el) return;
    highlightDone.current = highlightId;
    window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      box.scrollTo({
        left: Math.max(0, r.left - b.left + box.scrollLeft - box.clientWidth / 2),
        top: Math.max(0, r.top - b.top + box.scrollTop - box.clientHeight / 2),
        behavior: 'smooth',
      });
    }, 400);
  }, [highlightId, rows]);

  /** Секция в фильтре — прокручиваем сетку к ней и подсвечиваем заголовок */
  const goSection = (id: string) => {
    const s = sections.find((x) => x.id === id);
    const box = scrollRef.current;
    if (!s || !box) return;
    setFocusSection(id);
    const th = box.querySelector<HTMLElement>(`[data-col="${s.colStart}"]`);
    if (th) box.scrollTo({ left: Math.max(0, th.offsetLeft - 52), behavior: 'smooth' });
    // На телефоне сетка ниже фильтров — показываем её
    if (isMobile) {
      const y = box.getBoundingClientRect().top + window.scrollY - 120;
      if (Math.abs(window.scrollY - y) > 40) window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Ячейка тянется на свободную ширину (мало стояков — не оставляем полкарточки пустой)
  const CELL = cn('w-full rounded-lg', isMobile ? 'min-w-[80px]' : 'min-w-[84px]', hasNumbers ? 'h-[64px]' : 'h-[54px]');
  const groupGaps = columns.filter((c) => c.groupStart).length;
  const tableWidth = `min(100%, ${columns.length * 150 + groupGaps * 16 + 56}px)`;

  const renderCell = (cell: ChessboardApartmentCell | null, floor: number, col: number) => {
    if (!cell && isOutside(floor, col)) {
      const sec = secOfCol(col);
      if (sec && floor === sec.maxFloor + 1) {
        return (
          <div className={cn(CELL, 'flex items-end pb-1')} aria-hidden>
            <div className="h-1 w-full rounded-full bg-muted-foreground/25" />
          </div>
        );
      }
      return <div className={CELL} aria-hidden />;
    }
    if (!cell) {
      return <div className={cn(CELL, 'border border-dashed border-border/80')} title="Нет в продаже" aria-hidden />;
    }
    const dim = isDimmed(cell.rooms);
    const badge = cell.rooms >= 4 ? roomBadgeBig : roomBadge(cell.rooms);
    if (cell.status === 'sold') {
      return (
        <div
          className={cn(CELL, 'chess-sold flex flex-col justify-between border border-transparent px-2 py-1.5 text-[11px] leading-none text-muted-foreground', dim && 'opacity-30')}
          title={`Продана · ${roomLabel(cell.rooms)}, ${fmtArea(cell.area)} м²${cell.number ? ` · № ${cell.number}` : ''}`}
        >
          {hasNumbers ? <span className="tabular-nums">{cell.number ? `№${cell.number}` : ''}</span> : null}
          <span className="flex items-baseline justify-between gap-1">
            <span className="font-semibold">{shortRooms(cell.rooms)}</span>
            <span className="tabular-nums">{fmtArea(cell.area)}</span>
          </span>
          <span>продана</span>
        </div>
      );
    }
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
          'flex cursor-pointer flex-col justify-between border px-2 py-1.5 text-left leading-none transition-[transform,border-color,box-shadow,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          reserved
            ? 'border-amber-400/70 bg-amber-50 hover:border-amber-500 dark:bg-amber-400/10'
            : 'border-primary/25 bg-background shadow-[0_1px_0_hsl(var(--border))] hover:-translate-y-px hover:border-primary hover:shadow-md',
          dim && 'opacity-20 hover:translate-y-0',
          highlightId === cell.id && 'ring-2 ring-primary ring-offset-2',
        )}
      >
        {hasNumbers ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{cell.number ? `№${cell.number}` : ' '}</span>
        ) : null}
        <span className="flex items-center justify-between gap-1">
          <span className={cn('rounded px-1 py-0.5 text-[11px] font-bold', badge)}>{shortRooms(cell.rooms)}</span>
          <span className="text-[12px] tabular-nums text-muted-foreground">{fmtArea(cell.area)}</span>
        </span>
        <span className="truncate text-[12px] font-semibold tabular-nums text-foreground">
          {reserved ? 'бронь' : price || 'по запросу'}
        </span>
      </div>
    );
  };

  if (!matrix) {
    return <p className="rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">Шахматки по этому ЖК пока нет</p>;
  }

  const selectClass = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] font-medium';
  const literalsAsSelect = isMobile;

  const roomChips = onRoomFilter ? (
    <div className="chess-fade-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide lg:flex-wrap" role="group" aria-label="Комнатность">
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
          <span className={cn('tabular-nums', roomFilter === r.key ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{roomCounts.get(r.key)}</span>
        </button>
      ))}
    </div>
  ) : null;

  const legend = (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground" aria-label="Обозначения">
      <li className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded border border-primary/30 bg-background" />
        Свободна <b className="font-semibold tabular-nums text-foreground">{fmtInt(counts.available)}</b>
      </li>
      {counts.reserved > 0 ? (
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-amber-400/70 bg-amber-50" />
          Бронь <b className="font-semibold tabular-nums text-foreground">{counts.reserved}</b>
        </li>
      ) : null}
      {counts.sold > 0 ? (
        <li className="flex items-center gap-1.5">
          <span className="chess-sold h-3.5 w-3.5 rounded" />
          Продана <b className="font-semibold tabular-nums text-foreground">{fmtInt(counts.sold)}</b>
        </li>
      ) : null}
      {counts.closed > 0 ? (
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-dashed border-border" />
          Нет в продаже <b className="font-semibold tabular-nums text-foreground">{fmtInt(counts.closed)}</b>
        </li>
      ) : null}
    </ul>
  );

  const filters = (
    <div className={cn('rounded-2xl border border-border/70 bg-card', isMobile ? 'space-y-3 p-3' : 'space-y-4 p-5')}>
      {literals.length > 1 || sections.length > 1 ? (
      <div className={cn('grid', isMobile ? 'grid-cols-2 gap-2' : 'gap-4 lg:grid-cols-[minmax(0,1fr)_auto]')}>
        {literals.length > 1 ? (
          <div className="min-w-0">
            {label('Дом')}
            {literalsAsSelect ? (
              <select
                aria-label="Дом"
                className={selectClass}
                value={literalName}
                onChange={(e) => {
                  const l = literals.find((x) => x.group === e.target.value);
                  if (l) onBuildingChange(l.firstId);
                }}
              >
                {literals.map((l) => (
                  <option key={l.group} value={l.group}>
                    {l.group}
                    ({l.available})
                  </option>
                ))}
              </select>
            ) : (
              <div className="chess-fade-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide" role="group" aria-label="Дом">
                {literals.map((l) => {
                  const active = l.group === literalName;
                  return (
                    <button
                      key={l.group}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onBuildingChange(l.firstId)}
                      className={cn(
                        'flex min-h-12 shrink-0 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition-colors',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50',
                      )}
                    >
                      <span className="text-[14px] font-semibold leading-tight">{l.group}</span>
                      <span className={cn('text-[11px] leading-tight', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {l.deadline ? `${l.deadline} · ` : ''}
                        {l.available} в продаже
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
        {sections.length > 1 && isMobile ? (
          <div className="min-w-0">
            {label('Секция')}
            <select aria-label="Секция" className={selectClass} value={focusSection ?? ''} onChange={(e) => e.target.value && goSection(e.target.value)}>
              <option value="">Все секции</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.available})
                </option>
              ))}
            </select>
          </div>
        ) : sections.length > 1 ? (
          <div className="min-w-0">
            {label('Секция / подъезд')}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide lg:flex-wrap" role="group" aria-label="Секция">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={focusSection === s.id}
                  title={`${s.label}: ${s.available} в продаже из ${s.total}`}
                  className={cn(chipClass(focusSection === s.id), 'min-w-10')}
                  onClick={() => goSection(s.id)}
                >
                  {s.label.replace(/^(секция|подъезд)\s*/i, '')}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      ) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {roomChips ? (
          <div className="min-w-0">
            {isMobile ? null : label('Комнаты')}
            {roomChips}
          </div>
        ) : null}
      </div>
      {isMobile ? null : legend}
    </div>
  );

  const dl = deadlineQuarter(matrix.deadline) ?? activeLiteral?.deadline ?? null;

  return (
    <div className="space-y-3">
      {filters}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1">
        <h3 className="text-[17px] font-semibold">
          {literalName}
          {dl ? <span className="font-normal text-muted-foreground"> — сдача {dl}</span> : null}
        </h3>
        <p className="text-[14px] text-muted-foreground">
          <b className="font-semibold text-foreground tabular-nums">{fmtInt(counts.available + counts.reserved)}</b> в продаже из{' '}
          <span className="tabular-nums">{fmtInt(counts.total)}</span> · {rows.length}{' '}
          {rows.length === 1 ? 'этаж' : rows.length % 10 >= 2 && rows.length % 10 <= 4 && (rows.length < 12 || rows.length > 14) ? 'этажа' : 'этажей'}
        </p>
      </div>

      <div
        role="group"
        aria-label={`Шахматка: ${literalName}`}
        aria-busy={isLoading}
        onMouseOver={onOver}
        onMouseLeave={scheduleClose}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={cn('rounded-2xl border border-border/70 bg-card', isLoading && 'pointer-events-none opacity-60')}
      >
        {rows.length && columns.length ? (
          <div className="relative">
          {edge.left || edge.right ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-[5]">
              {edge.left ? <div className="absolute inset-y-0 left-10 w-10 bg-gradient-to-r from-card to-transparent" /> : null}
              {edge.right ? <div className="absolute inset-y-0 right-0 w-12 rounded-r-2xl bg-gradient-to-l from-card to-transparent" /> : null}
              {edge.left && !isMobile ? (
                <button
                  type="button"
                  aria-label="Прокрутить влево"
                  onClick={() => scrollRef.current?.scrollBy({ left: -480, behavior: 'smooth' })}
                  className="pointer-events-auto absolute left-11 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-lg shadow-md hover:border-primary"
                >
                  ‹
                </button>
              ) : null}
              {edge.right && !isMobile ? (
                <button
                  type="button"
                  aria-label="Прокрутить вправо"
                  onClick={() => scrollRef.current?.scrollBy({ left: 480, behavior: 'smooth' })}
                  className="pointer-events-auto absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-lg shadow-md hover:border-primary"
                >
                  ›
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            ref={scrollRef}
            onScroll={updateEdge}
            className={cn(
              'overscroll-x-contain',
              // На телефоне без вертикальной прокрутки внутри страницы — только вбок
              isMobile ? 'overflow-x-auto overflow-y-hidden' : 'max-h-[min(78vh,820px)] overflow-auto',
            )}
          >
            <table className="border-separate border-spacing-[3px]" style={{ minWidth: 'max-content', width: tableWidth }}>
              <thead>
                {groupHeader ? (
                  <tr>
                    <th className="sticky left-0 top-0 z-[3] bg-card" />
                    {groupHeader.map((g, gi) => {
                      const sec = sections.find((s) => s.label === g.label || g.label.startsWith(`${s.label} ·`));
                      const focused = sec && focusSection === sec.id;
                      // Крыша в шапке — только у секций до верхнего этажа литера; у низких — над их верхним этажом
                      const roofInHeader = !sec || sec.maxFloor >= topFloor;
                      return (
                        <th
                          key={gi}
                          colSpan={g.span + (gi > 0 ? 1 : 0)}
                          className={cn('sticky top-0 z-[2] h-[30px] bg-card pb-1 text-left align-bottom shadow-[0_-3px_0_hsl(var(--card))]', gi > 0 && 'pl-4')}
                        >
                          <span
                            className={cn(
                              'block rounded-t-lg border-b-4 px-1 pb-1 text-[12px] font-semibold uppercase tracking-wide transition-colors',
                              focused ? 'border-primary text-primary' : 'border-muted-foreground/25 text-muted-foreground',
                              !roofInHeader && 'border-transparent',
                            )}
                          >
                            {g.label || '—'}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                ) : null}
                <tr>
                  <th className={cn('sticky left-0 z-[3] bg-card pr-1 text-right text-[11px] font-medium text-muted-foreground shadow-[3px_0_0_hsl(var(--card)),0_3px_0_hsl(var(--card))]', groupHeader ? 'top-[33px]' : 'top-0')}>
                    Этаж
                  </th>
                  {columns.map((c, i) => (
                    <Fragment key={i}>
                      {c.groupStart ? <th aria-hidden className="w-3" /> : null}
                      <th
                        data-col={i}
                        className={cn('sticky z-[2] bg-card text-center text-[11px] font-normal text-muted-foreground tabular-nums shadow-[0_3px_0_hsl(var(--card))]', groupHeader ? 'top-[33px]' : 'top-0')}
                        title={`Стояк ${c.label} (окно №${c.origin} у застройщика)`}
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
                    <th scope="row" className="sticky left-0 z-[1] w-10 bg-card pr-2 text-right text-[13px] font-semibold text-foreground/70 tabular-nums shadow-[3px_0_0_hsl(var(--card)),0_3px_0_hsl(var(--card)),0_-3px_0_hsl(var(--card))]">
                      {r.floor}
                    </th>
                    {r.cells.map((cell, i) => (
                      <Fragment key={i}>
                        {columns[i]?.groupStart ? <td aria-hidden className="w-3" /> : null}
                        <td className="p-0">{renderCell(cell, r.floor, i)}</td>
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">В этом доме нет данных о квартирах</p>
        )}
      </div>
      {isMobile ? legend : null}
      <p className="text-[12px] text-muted-foreground">
        {isMobile ? 'Нажмите на свободную квартиру — покажем планировку.' : 'Наведите на квартиру — покажем планировку, нажмите — откроем её страницу.'}{' '}
        {columns.length > 12 ? 'Сетку можно прокручивать вбок. ' : ''}Данные застройщика, обновляются несколько раз в день.
      </p>

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
              <ChessboardPreview
                apartment={hover.apt}
                buildingName={hover.where}
                section={0}
                roomLabel={roomLabel(hover.apt.rooms)}
                onLead={onApartmentLead ? () => onApartmentLead(leadSummary(hover.apt, hover.where), hover.apt.id) : undefined}
              />
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
              apartment={sheetApt.apt}
              buildingName={sheetApt.where}
              section={0}
              roomLabel={roomLabel(sheetApt.apt.rooms)}
              onClose={() => setSheetApt(null)}
              onLead={
                onApartmentLead
                  ? () => {
                      const s = leadSummary(sheetApt.apt, sheetApt.where);
                      const id = sheetApt.apt.id;
                      setSheetApt(null);
                      onApartmentLead(s, id);
                    }
                  : undefined
              }
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Chessboard;
