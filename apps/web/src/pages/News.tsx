import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Loader2, Newspaper, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import Header from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import LeadHighlightSection from '@/redesign/components/LeadHighlightSection';
import MissingPhotoPlaceholder from '@/redesign/components/MissingPhotoPlaceholder';
import { apiGet } from '@/lib/api';
import { stripHtmlToPlainText, truncatePlain } from '@/lib/html';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';

interface NewsRow {
  id: number;
  slug: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  /** Рубрика публикации — приходит в поле source */
  source: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface PaginatedResult {
  data: NewsRow[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

const ALL_TAB = 'Все';
/**
 * Публичный список новостей не умеет ни поиск, ни фильтр по рубрике,
 * поэтому берём ленту одним запросом и отбираем на клиенте.
 * Серверная фильтрация описана в docs/BACKEND_TODO.md.
 */
const PER_PAGE = 60;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

const News = () => {
  const [tab, setTab] = useState(ALL_TAB);
  const [query, setQuery] = useState('');
  const { data: regionId } = useDefaultRegionId();

  const { data, isPending: isLoading } = useQuery({
    queryKey: ['news', 'public', regionId ?? null],
    queryFn: () =>
      apiGet<PaginatedResult>(
        `/news?page=1&per_page=${PER_PAGE}${regionId != null ? `&region_id=${regionId}` : ''}`,
      ),
    enabled: regionId != null,
    staleTime: 60_000,
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const isEmpty = !isLoading && rows.length === 0;

  // Рубрики берём из самих публикаций: выдуманных вкладок быть не должно
  const tabs = useMemo(() => {
    const found = new Set<string>();
    for (const r of rows) {
      const s = r.source?.trim();
      if (s) found.add(s);
    }
    return [ALL_TAB, ...[...found].sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== ALL_TAB && r.source?.trim() !== tab) return false;
      if (!q) return true;
      const haystack = `${r.title} ${stripHtmlToPlainText(r.body ?? '')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, tab, query]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="section-y" aria-labelledby="news-title">
        <div className="container-page">
          <p className="text-overline text-muted-foreground">Новости и аналитика</p>
          <h1 id="news-title" className="text-section-title mt-3">
            Рынок недвижимости Анапы
          </h1>

          {/* Рубрики и поиск — только когда есть что искать */}
          {isEmpty ? null : (
          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {tabs.length > 1 ? (
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Рубрики">
                {tabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'h-10 rounded-full px-4 text-sm font-medium transition-colors',
                      tab === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground hover:bg-secondary/70',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}

            <div className="relative w-full lg:w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-base outline-none md:text-sm transition-colors focus:border-primary/60"
                placeholder="Поиск по новостям"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Поиск по новостям"
              />
            </div>
          </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Загрузка" />
            </div>
          ) : isEmpty ? (
            <div className="mx-auto mt-10 max-w-md rounded-[20px] border border-border bg-card px-6 py-10 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <h2 className="mt-4 text-lg font-semibold">Новости скоро появятся</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Пока раздел пополняется, посмотрите актуальные новостройки и квартиры в каталоге или на карте.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Link
                  to="/catalog"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Открыть каталог
                </Link>
                <Link
                  to="/map"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium hover:bg-muted/50"
                >
                  Поиск на карте
                </Link>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">По этому запросу ничего не нашлось.</p>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((n) => (
                <Link
                  key={n.id}
                  to={`/news/${n.slug}`}
                  className="group flex flex-col overflow-hidden rounded-[20px] border border-border bg-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    {n.imageUrl ? (
                      <img
                        src={n.imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <MissingPhotoPlaceholder label="Без обложки" />
                    )}
                    {n.source?.trim() ? (
                      <span className="absolute left-3 top-3 rounded-lg bg-graphite/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                        {n.source}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {formatDate(n.publishedAt ?? n.createdAt)}
                    </div>

                    <h2 className="mt-3 text-base font-bold leading-snug line-clamp-2">{n.title}</h2>

                    {n.body ? (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                        {truncatePlain(stripHtmlToPlainText(n.body), 180)}
                      </p>
                    ) : null}

                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Читать
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <LeadHighlightSection source="news:selection" />
      <FooterSection reserveMobileNav />
    </div>
  );
};

export default News;
