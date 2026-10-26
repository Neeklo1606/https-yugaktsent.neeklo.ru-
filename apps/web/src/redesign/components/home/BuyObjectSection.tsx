import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { buildListingsSearchParams } from '@/redesign/lib/catalog-api-params';
import { catalogFiltersIntoSearchParams } from '@/redesign/lib/catalog-url-sync';
import { formatPriceFrom } from '@/redesign/lib/display-price';
import { defaultFilters, type CatalogFilters } from '@/redesign/data/types';

const TILES: { rooms: number; title: string }[] = [
  { rooms: 0, title: 'Студии' },
  { rooms: 1, title: '1-комнатные' },
  { rooms: 2, title: '2-комнатные' },
  { rooms: 3, title: '3-комнатные' },
  { rooms: 4, title: '4 комнаты и больше' },
];

const countLabel = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'предложение' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'предложения' : 'предложений';
  return `${n.toLocaleString('ru-RU')} ${word}`;
};

/**
 * «Купить объект»: вход в каталог по комнатности с живыми цифрами из API —
 * число предложений и цена «от». Пустые плитки не показываем.
 */
const BuyObjectSection = () => {
  const { data: regionId } = useDefaultRegionId();

  const results = useQueries({
    queries: TILES.map((t) => {
      const filters: CatalogFilters = { ...defaultFilters, objectType: 'apartments', marketType: 'new', rooms: [t.rooms] };
      return {
        queryKey: ['home', 'buy-tile', regionId, t.rooms],
        enabled: regionId != null,
        staleTime: 5 * 60_000,
        queryFn: async () => {
          const sp = buildListingsSearchParams({ filters, regionId, page: 1, perPage: 1 });
          sp.set('sort', 'price_asc');
          const res = await apiGet<{ data?: { price?: string | number | null }[]; meta?: { total?: number } }>(`/listings?${sp}`);
          return { total: res.meta?.total ?? 0, minPrice: res.data?.[0]?.price ?? null };
        },
      };
    }),
  });

  const loading = results.some((r) => r.isLoading);
  const tiles = TILES.map((t, i) => ({ ...t, ...results[i].data })).filter((t) => (t.total ?? 0) > 0);
  if (!loading && tiles.length === 0) return null;

  const hrefFor = (rooms: number) => {
    const sp = catalogFiltersIntoSearchParams(new URLSearchParams(), { ...defaultFilters, objectType: 'apartments', marketType: 'new', rooms: [rooms] });
    if (regionId != null) sp.set('region_id', String(regionId));
    return `/catalog?${sp.toString()}`;
  };

  return (
    <section className="container-page section-y" aria-labelledby="buy-title">
      <div className="flex items-end justify-between gap-4">
        <h2 id="buy-title" className="text-section-title">
          Купить квартиру
        </h2>
        <Link to="/catalog?type=apartments&market=new" className="hidden shrink-0 items-center gap-1 text-[15px] font-medium text-primary hover:underline underline-offset-4 sm:inline-flex">
          Весь каталог
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <p className="text-lead mt-2 max-w-[560px]">Новостройки Анапы по числу комнат. Цены — от минимальной в продаже сейчас.</p>

      <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:mt-8 lg:grid-cols-4">
        {loading && tiles.length === 0
          ? TILES.slice(0, 4).map((t) => (
              <li key={t.rooms} className="h-[104px] animate-pulse rounded-card bg-muted lg:h-[120px]" aria-hidden />
            ))
          : tiles.map((t) => (
              <li key={t.rooms}>
                <Link
                  to={hrefFor(t.rooms)}
                  className="group flex h-full min-h-[104px] flex-col justify-between rounded-card border border-border bg-card p-4 transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-raised lg:min-h-[120px] lg:p-5"
                >
                  <span className="text-[16px] font-semibold leading-tight text-foreground lg:text-[18px]">{t.title}</span>
                  <span className="mt-3 grid gap-0.5">
                    {t.minPrice != null ? <span className="text-price text-[15px] text-foreground">{formatPriceFrom(t.minPrice)}</span> : null}
                    <span className="text-[13px] text-muted-foreground">{countLabel(t.total ?? 0)}</span>
                  </span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
};

export default BuyObjectSection;
