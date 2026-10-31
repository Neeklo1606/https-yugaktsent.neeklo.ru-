import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import ListingCard, { type ApiListingCardRow } from '@/redesign/components/ListingCard';
import SnapRail from '@/redesign/components/home/SnapRail';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { useHomeBlocks } from '@/redesign/hooks/useHomeBlocks';
import { pickHomeApartments } from '@/redesign/lib/home-apartments';

const SHOW = 8;
const PER_BLOCK = 48;

/**
 * «Квартиры в продаже»: конкретные квартиры, а не ещё один список ЖК.
 * По запросу на каждый ЖК из «Популярных» (список уже в кэше), затем отбор:
 * только свободные лоты с планировкой, правдоподобной площадью и жилым этажом,
 * без повторов одной планировки, по очереди из разных комплексов.
 */
const HomeApartmentsSection = () => {
  const { data: regionId } = useDefaultRegionId();
  const blocks = useHomeBlocks();
  const blockIds = useMemo(
    () => (blocks.data?.data ?? []).filter((b) => (b._count?.listings ?? 0) > 0).map((b) => b.id).slice(0, 6),
    [blocks.data],
  );

  const results = useQueries({
    queries: blockIds.map((id) => ({
      queryKey: ['home', 'apartments', id],
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const sp = new URLSearchParams({ block_id: String(id), kind: 'APARTMENT', status: 'ACTIVE', per_page: String(PER_BLOCK), sort: 'created_desc' });
        // Отсекаем на сервере кладовые: в фиде «Хозяина Морей» они идут студиями на −1 этаже
        sp.set('area_total_min', '18');
        sp.set('floor_min', '1');
        return (await apiGet<{ data?: ApiListingCardRow[] }>(`/listings?${sp}`)).data ?? [];
      },
    })),
  });

  const isLoading = blocks.isLoading || results.some((r) => r.isLoading);
  const pages = results.map((r) => r.data);
  const rows = useMemo(() => pickHomeApartments(pages.flatMap((p) => p ?? []), SHOW), [pages]);
  if (!isLoading && rows.length === 0) return null;

  const allHref = `/catalog?type=apartments&market=new&group=flats${regionId != null ? `&region_id=${regionId}` : ''}`;

  return (
    <section className="container-page section-y" aria-labelledby="flats-title">
      <div className="mb-4 flex items-end justify-between gap-4 lg:mb-6">
        <div>
          <h2 id="flats-title" className="text-section-title">
            Квартиры в продаже
          </h2>
          <p className="text-lead mt-1.5 max-w-[560px]">Свободные квартиры с планировками — цены из актуальной выгрузки застройщиков.</p>
        </div>
        <Link to={allHref} className="inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
          Все квартиры
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[300px] animate-pulse rounded-card bg-muted" />
          ))}
        </div>
      ) : (
        <SnapRail label="Квартиры в продаже" desktopCols={4} compact>
          {rows.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </SnapRail>
      )}
    </section>
  );
};

export default HomeApartmentsSection;
