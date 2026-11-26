import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import ListingCard, { type ApiListingCardRow } from '@/redesign/components/ListingCard';
import { RECOMMENDATION_REASON_LABEL } from '@lg/shared';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';

type RecommendationRow = ApiListingCardRow & {
  recommendation?: { score: number; signals: string[]; reason?: string };
};

type Props = {
  title?: string;
  fetchUrl: string;
  queryKey: readonly unknown[];
  className?: string;
  excludeId?: number;
};

function SkeletonCard() {
  return (
    <div className="shrink-0 w-[260px] sm:w-[280px] rounded-2xl border overflow-hidden">
      <StableMediaFrame aspect="4/3" className="bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

export default function RelatedListingsCarousel({
  title = 'Похожие объекты',
  fetchUrl,
  queryKey,
  className,
  excludeId,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => apiGet<{ data: RecommendationRow[] }>(fetchUrl),
    staleTime: 60_000,
  });

  const rows = (query.data?.data ?? [])
    .filter((r) => r.id !== excludeId)
    .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);

  const scroll = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  if (query.isLoading) {
    return (
      <section className={cn('space-y-3', className)}>
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (query.isError || rows.length === 0) return null;

  return (
    <section className={cn('space-y-3 relative', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="hidden sm:flex gap-1">
          <button
            type="button"
            aria-label="Назад"
            onClick={() => scroll(-1)}
            className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted touch-manipulation"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Вперёд"
            onClick={() => scroll(1)}
            className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted touch-manipulation"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        /* Телефон: лента до краёв экрана, первая карточка — по линии отступа страницы (как «Похожие в ЖК») */
        className="-mx-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 px-4 pb-2 scroll-smooth touch-pan-x sm:mx-0 sm:scroll-px-0 sm:px-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {rows.map((listing) => {
          const reason = listing.recommendation?.reason;
          const reasonLabel =
            reason && RECOMMENDATION_REASON_LABEL[reason]
              ? RECOMMENDATION_REASON_LABEL[reason]
              : null;
          return (
            <div key={listing.id} className="shrink-0 w-[260px] sm:w-[280px] snap-start">
              {reasonLabel ? (
                <p className="text-[10px] text-muted-foreground mb-1 px-0.5 truncate">{reasonLabel}</p>
              ) : null}
              <ListingCard listing={listing} variant="grid" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
