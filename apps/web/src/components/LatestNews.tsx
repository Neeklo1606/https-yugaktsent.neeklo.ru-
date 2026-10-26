import { ArrowRight, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useSiteSettings } from '@/redesign/hooks/useSiteSettings';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { formatNewsDateShort, formatNewsSource } from '@/redesign/lib/news-source';

type NewsRow = {
  id: number;
  slug: string;
  title: string;
  imageUrl: string | null;
  source: string | null;
  publishedAt: string | null;
};

type NewsResponse = {
  data: NewsRow[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
};

function newsPerPage(map: Map<string, string> | undefined): number {
  const raw = map?.get('home_news_per_page');
  const n = parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : 4;
}

/**
 * Журнальная карточка: на телефоне — строка с миниатюрой (без карусели и обрезанных
 * соседей), на десктопе — колонка с фото 16:10.
 */
function NewsCard({ n }: { n: NewsRow }) {
  const sourceLabel = formatNewsSource(n.source);
  const dateLabel = formatNewsDateShort(n.publishedAt);
  const hasImage = Boolean(n.imageUrl?.trim());

  return (
    <Link
      to={`/news/${encodeURIComponent(n.slug)}`}
      className="group flex gap-3 py-3 lg:h-full lg:flex-col lg:gap-0 lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-card lg:py-0 lg:transition-shadow lg:hover:shadow-raised"
    >
      <div className="h-[72px] w-[96px] shrink-0 overflow-hidden rounded-lg bg-surface-soft lg:aspect-[16/10] lg:h-auto lg:w-full lg:rounded-none">
        {hasImage ? (
          <img src={n.imageUrl!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Newspaper className="h-6 w-6 opacity-40" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col lg:p-4">
        <p className="truncate text-[12px] text-muted-foreground">
          {[sourceLabel, dateLabel].filter(Boolean).join(' · ')}
        </p>
        <h3 className="mt-0.5 line-clamp-3 text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary lg:mt-1 lg:text-[16px]">{n.title}</h3>
      </div>
    </Link>
  );
}

const LatestNews = () => {
  const { data: siteMap } = useSiteSettings();
  const { data: regionId } = useDefaultRegionId();
  const perPage = newsPerPage(siteMap);

  const { data, isLoading } = useQuery({
    queryKey: ['news', 'home', perPage, regionId ?? null],
    queryFn: () =>
      apiGet<NewsResponse>(
        `/news?per_page=${perPage}&page=1${regionId != null ? `&region_id=${regionId}` : ''}`,
      ),
    enabled: regionId != null,
    staleTime: 300_000,
  });

  const items = data?.data ?? [];
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="section-y" aria-labelledby="home-news-title">
      <div className="container-page">
        <div className="mb-2 flex items-end justify-between gap-4 lg:mb-6">
          <h2 id="home-news-title" className="text-section-title">
            Новости
          </h2>
          <Link to="/news" className="inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-primary hover:underline underline-offset-4">
            Все новости
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {isLoading ? (
          <ul className="divide-y divide-border lg:grid lg:grid-cols-4 lg:gap-5 lg:divide-y-0" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex gap-3 py-3 lg:block lg:py-0">
                <div className="h-[72px] w-[96px] shrink-0 animate-pulse rounded-lg bg-muted lg:aspect-[16/10] lg:h-auto lg:w-full" />
                <div className="flex-1 space-y-2 pt-1 lg:pt-3">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-border lg:grid lg:grid-cols-4 lg:gap-5 lg:divide-y-0">
            {items.map((n) => (
              <li key={n.id}>
                <NewsCard n={n} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default LatestNews;
