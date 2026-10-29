import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Apartment } from '@/redesign/data/types';
import ChessboardMatrixGrid from '@/redesign/components/ChessboardMatrixGrid';
import ChessboardPreview, { ChessboardPreviewInline } from '@/redesign/components/ChessboardPreview';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  CHESS_STATUS_LABEL,
  CHESS_STATUS_ORDER,
  CHESS_SWATCH_CLASS,
  type ChessStatusKey,
} from '@/redesign/lib/chessboard-status';
import {
  chessObsHoverEnd,
  chessObsHoverStart,
  chessObsRegisterRender,
  chessObsSelection,
} from '@/redesign/lib/chessboard-observability';
import { roomCategoryFromRooms } from '@/redesign/lib/complex-room-groups';
import type { ChessboardApartmentCell, ChessboardBuildingMatrix } from '@/redesign/lib/chessboard-api';

export type ChessboardBuildingOption = {
  id: string;
  name: string;
  apartmentCount: number;
};

interface Props {
  /** Precomputed matrix from GET /blocks/:slug/chessboard — do not rebuild on client. */
  matrix: ChessboardBuildingMatrix;
  buildingName: string;
  roomFilter?: number | null;
  buildingOptions?: ChessboardBuildingOption[];
  activeBuildingId?: string | null;
  onBuildingChange?: (id: string) => void;
  isLoading?: boolean;
}

function roomLabel(rooms: number): string {
  if (rooms === 0) return 'Студия';
  if (rooms > 0) return `${rooms}-к.кв`;
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
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const fn = () => setMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

const Chessboard = ({
  matrix,
  buildingName,
  roomFilter = null,
  buildingOptions,
  activeBuildingId,
  onBuildingChange,
  isLoading = false,
}: Props) => {
  const navigate = useNavigate();
  const isMobile = useIsMobileChess();
  const gridRef = useRef<HTMLDivElement>(null);
  const hoverStartRef = useRef(0);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewHoveredRef = useRef(false);

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleHoverClose = useCallback(() => {
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = setTimeout(() => {
      if (!previewHoveredRef.current) setHoverPreview(null);
    }, 160);
  }, [clearHoverCloseTimer]);

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer]);

  const counts = matrix.statusCounts;

  const [activeStatuses, setActiveStatuses] = useState<Set<ChessStatusKey>>(
    () => new Set<ChessStatusKey>(['available', 'reserved', 'sold']),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    apt: Apartment;
    rect: DOMRect;
  } | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetApt, setMobileSheetApt] = useState<Apartment | null>(null);

  const aptById = useMemo(() => {
    const m = new Map<string, Apartment>();
    for (const row of matrix.grid) {
      for (const cell of row) {
        if (cell.apartment) m.set(cell.apartment.id, cellToApartment(cell.apartment));
      }
    }
    return m;
  }, [matrix.grid]);

  const isHidden = useCallback(
    (apt: Apartment) =>
      !activeStatuses.has(apt.status) ||
      (roomFilter !== null && roomCategoryFromRooms(apt.rooms) !== roomFilter),
    [activeStatuses, roomFilter],
  );

  const visibleCellCount = useMemo(() => {
    let n = 0;
    for (const row of matrix.grid) {
      for (const cell of row) {
        if (!cell.apartment) continue;
        const apt = cellToApartment(cell.apartment);
        if (!isHidden(apt)) n += 1;
      }
    }
    return n;
  }, [matrix.grid, isHidden]);

  useEffect(() => {
    chessObsRegisterRender({
      apartmentCount: matrix.apartmentCount,
      visibleCellCount,
      sectionCount: 1,
      floorCount: matrix.floors.length,
    });
  }, [matrix.apartmentCount, matrix.floors.length, visibleCellCount]);

  const toggleStatus = (s: ChessStatusKey) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size > 1) next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  };

  const resolveCellContext = useCallback(
    (el: HTMLElement): { apt: Apartment } | null => {
      const cell = el.closest('[data-apt-id]') as HTMLElement | null;
      if (!cell) return null;
      const id = cell.dataset.aptId;
      if (!id) return null;
      const apt = aptById.get(id);
      if (!apt) return null;
      return { apt };
    },
    [aptById],
  );

  const openMobileSheet = useCallback((apt: Apartment) => {
    setMobileSheetApt(apt);
    setMobileSheetOpen(true);
    setSelectedId(apt.id);
  }, []);

  const handleGridMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;
      const ctx = resolveCellContext(e.target as HTMLElement);
      if (!ctx || ctx.apt.status === 'sold' || isHidden(ctx.apt)) {
        setHoverPreview(null);
        return;
      }
      const cell = (e.target as HTMLElement).closest('[data-apt-id]') as HTMLElement;
      if (!cell) return;
      clearHoverCloseTimer();
      hoverStartRef.current = chessObsHoverStart(ctx.apt.id);
      const rect = cell.getBoundingClientRect();
      setHoverPreview({ apt: ctx.apt, rect });
      requestAnimationFrame(() => {
        chessObsHoverEnd(performance.now() - hoverStartRef.current);
      });
    },
    [isMobile, resolveCellContext, isHidden, clearHoverCloseTimer],
  );

  const handleGridMouseLeave = useCallback(() => {
    if (!isMobile) scheduleHoverClose();
  }, [isMobile, scheduleHoverClose]);

  useEffect(() => {
    if (!hoverPreview || isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearHoverCloseTimer();
        previewHoveredRef.current = false;
        setHoverPreview(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hoverPreview, isMobile, clearHoverCloseTimer]);

  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const ctx = resolveCellContext(e.target as HTMLElement);
      if (!ctx) return;
      const { apt } = ctx;
      if (apt.status === 'sold' || isHidden(apt)) return;

      const startedAt = performance.now();
      setSelectedId(apt.id);
      chessObsSelection(apt.id, startedAt);

      if (isMobile) {
        e.preventDefault();
        openMobileSheet(apt);
        return;
      }

      if (e.detail === 2) {
        navigate(`/apartment/${apt.id}`);
      }
    },
    [resolveCellContext, isHidden, isMobile, openMobileSheet, navigate],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.matches('[data-apt-id]')) return;
      const id = target.dataset.aptId;
      if (!id) return;
      const apt = aptById.get(id);
      if (!apt) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (apt.status !== 'sold' && !isHidden(apt)) {
          navigate(`/apartment/${apt.id}`);
        }
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cells = Array.from(
          gridRef.current?.querySelectorAll<HTMLElement>('[data-interactive="true"]') ?? [],
        );
        const idx = cells.indexOf(target);
        if (idx < 0) return;
        const delta =
          e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 1 : -1;
        const next = cells[idx + delta];
        next?.focus();
        const nextId = next?.dataset.aptId;
        const nextApt = nextId ? aptById.get(nextId) : null;
        if (nextApt) setSelectedId(nextApt.id);
      }
    },
    [aptById, isHidden, navigate],
  );

  const selectedApt = selectedId ? aptById.get(selectedId) ?? null : null;

  const previewPosition = useMemo(() => {
    if (!hoverPreview || isMobile) return null;
    const { rect } = hoverPreview;
    const previewW = 280;
    const previewH = 380;
    let left = rect.right + 8;
    let top = rect.top;
    if (left + previewW > window.innerWidth - 8) left = rect.left - previewW - 8;
    if (top + previewH > window.innerHeight - 8) top = window.innerHeight - previewH - 8;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    return { left, top };
  }, [hoverPreview, isMobile]);

  const showBuildingTabs =
    buildingOptions && buildingOptions.length > 1 && onBuildingChange != null;

  return (
    <div className="space-y-4">
      {showBuildingTabs ? (
        <div
          className="flex gap-0 overflow-x-auto border-b border-border/60 scrollbar-hide"
          role="tablist"
          aria-label="Корпуса и башни"
        >
          {buildingOptions.map((b) => {
            const active = b.id === (activeBuildingId ?? buildingOptions[0]?.id);
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onBuildingChange(b.id)}
                className={cn(
                  'relative shrink-0 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                {b.name}
                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                  ({b.apartmentCount})
                </span>
                <span
                  className={cn(
                    'absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">{buildingName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.available} свободных · {counts.reserved} в брони · {counts.sold} продано
            {matrix.shaftCount > 0 ? (
              <span className="ml-2 text-muted-foreground">
                · {matrix.shaftCount} стояков · {matrix.floors.length} этажей
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Фильтр статусов">
          {CHESS_STATUS_ORDER.map((s) => {
            const isActive = activeStatuses.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={isActive}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
                  isActive
                    ? 'border-foreground/20 bg-background text-foreground'
                    : 'border-transparent bg-muted/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('w-3 h-3 rounded border', CHESS_SWATCH_CLASS[s])} />
                <span>{CHESS_STATUS_LABEL[s]}</span>
                <span className="ml-1 text-muted-foreground tabular-nums">{counts[s]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={gridRef}
        role="group"
        aria-label={`Шахматка ${buildingName}`}
        aria-busy={isLoading}
        onMouseOver={handleGridMouseOver}
        onMouseLeave={handleGridMouseLeave}
        onClick={handleGridClick}
        onKeyDown={handleGridKeyDown}
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-card',
          isLoading && 'opacity-60 pointer-events-none',
        )}
      >
        <ChessboardMatrixGrid
          matrix={matrix}
          selectedId={selectedId}
          isHidden={isHidden}
          roomLabel={roomLabel}
        />
      </div>

      {!isMobile && hoverPreview && previewPosition
        ? createPortal(
            <div
              className="fixed z-[70] w-[280px] rounded-xl border border-border bg-popover p-3 shadow-xl pointer-events-auto transition-opacity duration-150"
              style={{ left: previewPosition.left, top: previewPosition.top }}
              role="dialog"
              aria-label="Превью квартиры"
              onMouseEnter={() => {
                previewHoveredRef.current = true;
                clearHoverCloseTimer();
              }}
              onMouseLeave={() => {
                previewHoveredRef.current = false;
                scheduleHoverClose();
              }}
            >
              <ChessboardPreview
                apartment={hoverPreview.apt}
                buildingName={buildingName}
                section={1}
                roomLabel={roomLabel(hoverPreview.apt.rooms)}
              />
            </div>,
            document.body,
          )
        : null}

      {isMobile && selectedApt ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <ChessboardPreviewInline apartment={selectedApt} buildingName={buildingName} section={1} />
        </div>
      ) : null}

      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left text-base">Квартира</SheetTitle>
          </SheetHeader>
          {mobileSheetApt ? (
            <ChessboardPreview
              apartment={mobileSheetApt}
              buildingName={buildingName}
              section={1}
              roomLabel={roomLabel(mobileSheetApt.rooms)}
              onClose={() => setMobileSheetOpen(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <p className="text-[11px] text-muted-foreground">
        {isMobile
          ? 'Нажмите на квартиру для просмотра. Белые свободны, жёлтые забронированы, тёмные проданы.'
          : 'Наведите для превью: карточка остаётся при наведении на неё, «Открыть» кликабелен. Двойной клик по ячейке открывает страницу квартиры, Esc закрывает.'}
      </p>
    </div>
  );
};

export default Chessboard;
