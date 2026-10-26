import { formatArea } from '@/redesign/lib/listing-format';
import { memo, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import type { ResidentialComplex } from '@/redesign/data/types';
import type { ListingMapItem } from '@/redesign/components/ListingsMapSearch';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import { cardVisual, metaDotLine } from '@/redesign/lib/card-visual';
import {
  MAP_SIDEBAR_ROW_GAP,
  MAP_SIDEBAR_ROW_HEIGHT,
  mapSidebarRowStride,
  resolveSidebarOverscan,
} from '@/redesign/lib/map-sidebar-layout';
import {
  isMapDebugEnabled,
  recordSidebarSelectionScroll,
} from '@/redesign/lib/map-render-observability';
import {
  prefersReducedMotion,
  shouldCoalesceSelectionScroll,
  sidebarScrollBehavior,
} from '@/redesign/lib/map-sidebar-scroll-utils';
import { useSidebarVirtualizerDebug } from '@/redesign/hooks/useSidebarVirtualizerDebug';
import {
  formatDisplayPrice,
  formatPriceFrom,
  isPriceFallbackText,
  priceAriaLabel,
} from '@/redesign/lib/display-price';

type BlockRowProps = {
  complex: ResidentialComplex;
  isActive: boolean;
  onSelect: (slug: string | null) => void;
  rowIndex: number;
  rowCount: number;
};

type ListingRowProps = {
  listing: ListingMapItem;
  isActive: boolean;
  onSelect: (id: number | null) => void;
  rowIndex: number;
  rowCount: number;
};

function rowFocusProps(index: number, count: number) {
  return {
    role: 'listitem' as const,
    'aria-setsize': count,
    'aria-posinset': index + 1,
  };
}

const KIND_LABEL: Record<string, string> = {
  APARTMENT: 'Квартира',
  HOUSE: 'Дом',
  LAND: 'Участок',
  COMMERCIAL: 'Коммерция',
};

/** «1-к.кв · 42 м²» — то, по чему объект узнают в списке. */
function listingHeadline(l: ListingMapItem): string {
  const rooms =
    l.rooms == null
      ? (KIND_LABEL[l.kind] ?? 'Объект')
      : l.rooms === 0
        ? 'Студия'
        : `${l.rooms}-к.кв`;
  const area = l.area && l.area > 0 ? formatArea(l.area) : null;
  const parts = [rooms, area].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return l.title ?? l.address ?? `Объект #${l.id}`;
}

const MapSidebarBlockRow = memo(function MapSidebarBlockRow({
  complex: c,
  isActive,
  onSelect,
  rowIndex,
  rowCount,
}: BlockRowProps) {
  const price = formatPriceFrom(c.priceFrom);
  const blockMeta = metaDotLine([
    c.district && c.district !== '—' ? c.district : null,
    c.deadline && c.deadline !== '—' ? c.deadline : null,
  ]);
  const focusProps = rowFocusProps(rowIndex, rowCount);

  return (
    <div className="flex min-h-0 min-w-0 gap-0.5" style={{ height: MAP_SIDEBAR_ROW_HEIGHT }} {...focusProps}>
      <button
        type="button"
        onClick={() => onSelect(isActive ? null : c.slug)}
        className={cn(
          cardVisual.sidebarRow,
          'h-full min-h-0 flex-1 text-left',
          isActive
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border/60 bg-background hover:bg-muted/50',
        )}
        aria-current={isActive ? 'true' : undefined}
      >
        <StableMediaFrame
          src={c.images[0]}
          altContext={c.name}
          aspect="4/3"
          className={cardVisual.sidebarThumb}
          fallback="branded"
          loading="lazy"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 overflow-hidden">
          <p className={cardVisual.sidebarTitle} data-sidebar-title>{c.name}</p>
          <p
            className={cn(
              cardVisual.sidebarPrice,
              isPriceFallbackText(price) ? 'font-semibold text-muted-foreground' : 'text-primary',
            )}
            aria-label={priceAriaLabel(price)}
          >
            {price}
          </p>
          {blockMeta ? <p className={cardVisual.sidebarMeta}>{blockMeta}</p> : null}
        </div>
      </button>
      <Link
        to={`/complex/${c.slug}`}
        className="flex min-w-[28px] shrink-0 items-center justify-center self-stretch px-1 text-[10px] text-muted-foreground hover:text-primary"
        aria-label={`Открыть ${c.name}`}
        tabIndex={-1}
      >
        →
      </Link>
    </div>
  );
});

const MapSidebarListingRow = memo(function MapSidebarListingRow({
  listing: l,
  isActive,
  onSelect,
  rowIndex,
  rowCount,
}: ListingRowProps) {
  const listingPrice = formatDisplayPrice(l.price);
  const headline = listingHeadline(l);
  const listingMeta = metaDotLine([
    l.complexName ?? null,
    l.deadline && l.deadline !== '—' ? l.deadline : null,
    !l.complexName && l.address ? l.address : null,
  ]);
  const focusProps = rowFocusProps(rowIndex, rowCount);

  return (
    <div className="flex min-h-0 min-w-0 gap-0.5" style={{ height: MAP_SIDEBAR_ROW_HEIGHT }} {...focusProps}>
      <button
        type="button"
        onClick={() => onSelect(isActive ? null : l.id)}
        className={cn(
          cardVisual.sidebarRow,
          'h-full min-h-0 flex-1 text-left',
          isActive
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border/60 bg-background hover:bg-muted/50',
        )}
        aria-current={isActive ? 'true' : undefined}
      >
        <StableMediaFrame
          src={l.photoUrl}
          altContext={headline}
          aspect="4/3"
          className={cardVisual.sidebarThumb}
          fallback="branded"
          loading="lazy"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 overflow-hidden">
          <p className={cardVisual.sidebarTitle} data-sidebar-title>
            {headline}
          </p>
          <p
            className={cn(
              cardVisual.sidebarPrice,
              isPriceFallbackText(listingPrice) ? 'font-semibold text-muted-foreground' : 'text-primary',
            )}
            aria-label={priceAriaLabel(listingPrice)}
          >
            {listingPrice}
          </p>
          {listingMeta ? <p className={cardVisual.sidebarMeta}>{listingMeta}</p> : null}
        </div>
      </button>
      <Link
        to={`/listing/${l.id}`}
        className="flex min-w-[28px] shrink-0 items-center justify-center self-stretch px-1 text-[10px] text-muted-foreground hover:text-primary"
        aria-label="Открыть объект"
        tabIndex={-1}
      >
        →
      </Link>
    </div>
  );
});

type BlocksProps = {
  mode: 'blocks';
  blocks: ResidentialComplex[];
  activeSlug: string | null;
  onSelectBlock: (slug: string | null) => void;
  listResetKey: string;
};

type ListingsProps = {
  mode: 'listings';
  listings: ListingMapItem[];
  activeId: number | null;
  onSelectListing: (id: number | null) => void;
  listResetKey: string;
};

type Props = BlocksProps | ListingsProps;

/**
 * Virtualized map sidebar list — same rows/semantics as legacy map().
 * Rollback: revert RedesignMap import to inline map().
 */
export default function MapSidebarVirtualList(props: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevResetKeyRef = useRef(props.listResetKey);
  const prevActiveRef = useRef<string | null>(null);
  const lastSelectionScrollAtRef = useRef(0);

  const isBlocks = props.mode === 'blocks';
  const blocks = isBlocks ? props.blocks : [];
  const listings = isBlocks ? [] : props.listings;
  const count = isBlocks ? blocks.length : listings.length;
  const activeSlug = isBlocks ? props.activeSlug : null;
  const activeId = isBlocks ? null : props.activeId;

  const overscan = resolveSidebarOverscan();

  const activeIndex = useMemo(() => {
    if (isBlocks) {
      if (!activeSlug) return -1;
      return blocks.findIndex((c) => c.slug === activeSlug);
    }
    if (activeId == null) return -1;
    return listings.findIndex((l) => l.id === activeId);
  }, [isBlocks, activeSlug, activeId, blocks, listings]);

  const sidebarDebug = import.meta.env.DEV && isMapDebugEnabled();

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => mapSidebarRowStride(),
    overscan,
    gap: MAP_SIDEBAR_ROW_GAP,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useSidebarVirtualizerDebug({
    scrollRef,
    virtualItems,
    totalRows: count,
    activeIndex,
    enabled: sidebarDebug,
  });

  useEffect(() => {
    if (prevResetKeyRef.current !== props.listResetKey) {
      prevResetKeyRef.current = props.listResetKey;
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [props.listResetKey]);

  const activeKey = isBlocks
    ? activeSlug
    : activeId != null
      ? String(activeId)
      : null;

  useEffect(() => {
    if (activeKey == null) {
      prevActiveRef.current = null;
      return;
    }
    if (activeKey === prevActiveRef.current) return;
    prevActiveRef.current = activeKey;

    const index = activeIndex;
    if (index >= 0) {
      const t0 = sidebarDebug ? performance.now() : 0;
      const coalesce = shouldCoalesceSelectionScroll(lastSelectionScrollAtRef.current);
      const behavior = coalesce || prefersReducedMotion() ? 'auto' : sidebarScrollBehavior();
      lastSelectionScrollAtRef.current = performance.now();
      virtualizer.scrollToIndex(index, { align: 'auto', behavior });
      if (sidebarDebug) {
        requestAnimationFrame(() => {
          recordSidebarSelectionScroll(performance.now() - t0);
        });
      }
    }
  }, [activeKey, activeIndex, virtualizer, sidebarDebug]);

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const currentIndex = activeIndex;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(currentIndex < 0 ? 0 : currentIndex + 1, count - 1);
      if (isBlocks) props.onSelectBlock(blocks[next]?.slug ?? null);
      else props.onSelectListing(listings[next]?.id ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(currentIndex < 0 ? 0 : currentIndex - 1, 0);
      if (isBlocks) props.onSelectBlock(blocks[next]?.slug ?? null);
      else props.onSelectListing(listings[next]?.id ?? null);
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (isBlocks) props.onSelectBlock(blocks[0]?.slug ?? null);
      else props.onSelectListing(listings[0]?.id ?? null);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (isBlocks) props.onSelectBlock(blocks[count - 1]?.slug ?? null);
      else props.onSelectListing(listings[count - 1]?.id ?? null);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5"
      style={{ overscrollBehavior: 'contain' }}
      role="list"
      aria-label={props.mode === 'blocks' ? 'Список ЖК' : 'Список объектов'}
      tabIndex={0}
      onKeyDown={onListKeyDown}
      data-sidebar-scroll
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((item) => (
          <div
            key={item.key}
            className="absolute left-0 top-0 w-full"
            data-sidebar-row
            data-sidebar-index={item.index}
            style={{
              height: MAP_SIDEBAR_ROW_HEIGHT,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {isBlocks ? (
              <MapSidebarBlockRow
                complex={blocks[item.index]!}
                isActive={activeSlug === blocks[item.index]!.slug}
                onSelect={props.onSelectBlock}
                rowIndex={item.index}
                rowCount={count}
              />
            ) : (
              <MapSidebarListingRow
                listing={listings[item.index]!}
                isActive={activeId === listings[item.index]!.id}
                onSelect={props.onSelectListing}
                rowIndex={item.index}
                rowCount={count}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { MapSidebarBlockRow, MapSidebarListingRow };
