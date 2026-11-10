import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, LayoutGrid, MessageCircle, Phone } from 'lucide-react';
import { apiGet } from '@/lib/api';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { telHref } from '@/lib/contact-links';
import { buildListingsSearchParams } from '@/redesign/lib/catalog-api-params';
import { catalogFiltersIntoSearchParams } from '@/redesign/lib/catalog-url-sync';
import { formatPriceFrom } from '@/redesign/lib/display-price';
import { defaultFilters, type CatalogFilters } from '@/redesign/data/types';

const TILES: { rooms: number; title: string }[] = [
  { rooms: 0, title: 'Студии' },
  { rooms: 1, title: '1-комнатные' },
  { rooms: 2, title: '2-комнатные' },
  { rooms: 3, title: '3-комнатные' },
  { rooms: 4, title: '4+ комнат' },
];

const countLabel = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'квартира' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'квартиры' : 'квартир';
  return `${n.toLocaleString('ru-RU')} ${word}`;
};

type TileData = { total: number; minPrice: string | number | null; planUrl: string | null };

/**
 * «Купить квартиру» в духе ЦИАН: плитка на каждую комнатность с настоящей планировкой
 * самой доступной квартиры, ценой «от» и числом квартир в продаже — всё из каталога.
 * Последняя плитка — подбор с экспертом (заявка), чтобы блок не заканчивался тупиком.
 */
const BuyObjectSection = () => {
  const { data: regionId } = useDefaultRegionId();
  const [consultOpen, setConsultOpen] = useState(false);
  const { data: siteSettings } = useSiteSettings();
  const phone = settingOptional(siteSettings, 'phone_main');

  const results = useQueries({
    queries: TILES.map((t) => {
      const filters: CatalogFilters = { ...defaultFilters, objectType: 'apartments', marketType: 'new', rooms: [t.rooms] };
      return {
        queryKey: ['home', 'buy-tile-v2', regionId, t.rooms],
        enabled: regionId != null,
        staleTime: 5 * 60_000,
        queryFn: async (): Promise<TileData> => {
          const sp = buildListingsSearchParams({ filters, regionId, page: 1, perPage: 6 });
          sp.set('sort', 'price_asc');
          const res = await apiGet<{
            data?: { price?: string | number | null; apartment?: { planUrl?: string | null } | null }[];
            meta?: { total?: number };
          }>(`/listings?${sp}`);
          const rows = res.data ?? [];
          // Планировку берём у самой дешёвой квартиры, у которой она есть
          const withPlan = rows.find((r) => r.apartment?.planUrl?.trim());
          return {
            total: res.meta?.total ?? 0,
            minPrice: rows[0]?.price ?? null,
            planUrl: withPlan?.apartment?.planUrl?.trim() ?? null,
          };
        },
      };
    }),
  });

  const loading = results.some((r) => r.isLoading);
  const tiles = TILES.map((t, i) => ({ ...t, ...(results[i].data ?? { total: 0, minPrice: null, planUrl: null }) })).filter((t) => t.total > 0);
  if (!loading && tiles.length === 0) return null;

  const hrefFor = (rooms: number) => {
    const sp = catalogFiltersIntoSearchParams(new URLSearchParams(), { ...defaultFilters, objectType: 'apartments', marketType: 'new', rooms: [rooms] });
    if (regionId != null) sp.set('region_id', String(regionId));
    return `/catalog?${sp.toString()}`;
  };

  return (
    <section className="container-page section-y" aria-labelledby="buy-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="buy-title" className="text-section-title">
            Купить квартиру
          </h2>
          <p className="text-lead mt-2 max-w-[560px]">Выберите планировку — покажем все подходящие квартиры в новостройках с актуальными ценами застройщиков.</p>
        </div>
        <Link
          to="/catalog?type=apartments&market=new"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-primary/70 px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          Весь каталог
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-8 lg:grid-cols-6 lg:gap-4">
        {loading && tiles.length === 0
          ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-[236px] animate-pulse rounded-card bg-muted" aria-hidden />)
          : tiles.map((t) => (
              <li key={t.rooms}>
                <Link
                  to={hrefFor(t.rooms)}
                  className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft p-3">
                    {t.planUrl ? (
                      <StableMediaFrame
                        src={t.planUrl}
                        altContext={`Планировка: ${t.title}`}
                        sizes="(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 46vw"
                        loading="lazy"
                        fixedHeightClass="h-full w-full"
                        className="h-full w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground" aria-hidden>
                        <LayoutGrid className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3.5 lg:p-4">
                    <span className="text-[16px] font-semibold leading-tight text-foreground">{t.title}</span>
                    {t.minPrice != null ? <span className="text-price mt-1.5 text-[15px] text-foreground">{formatPriceFrom(t.minPrice)}</span> : null}
                    <span className="mt-auto flex items-center justify-between pt-2 text-[13px] text-muted-foreground">
                      {countLabel(t.total)}
                      <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            ))}

        <li className="col-span-2 sm:col-span-1">
          <div className="flex h-full flex-col justify-between rounded-card bg-primary p-4 text-primary-foreground lg:p-5">
            <div>
              <p className="text-[17px] font-semibold leading-snug">Не знаете, что выбрать?</p>
              <p className="mt-1.5 text-[14px] leading-snug text-primary-foreground/80">Подберём квартиру под бюджет и цель — бесплатно.</p>
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => setConsultOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-card px-3 text-[14px] font-semibold text-foreground transition-colors hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Подобрать
              </button>
              {phone ? (
                <a
                  href={telHref(phone)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary-foreground/40 px-3 text-[14px] font-semibold transition-colors hover:bg-primary-foreground/10"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {phone}
                </a>
              ) : null}
            </div>
          </div>
        </li>
      </ul>

      <ConsultationFlow
        open={consultOpen}
        onOpenChange={setConsultOpen}
        context={{ surface: 'home', source: 'buy-by-rooms', title: 'Подобрать квартиру', requestType: 'SELECTION' }}
      />
    </section>
  );
};

export default BuyObjectSection;
