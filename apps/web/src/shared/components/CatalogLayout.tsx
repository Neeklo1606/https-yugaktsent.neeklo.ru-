import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { LayoutGrid, List, SlidersHorizontal, X, Search, MapPin, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';

interface CatalogLayoutProps<T> {
  title: string;
  items: T[];
  filterFn: (items: T[], search: string, filters: Record<string, string>) => T[];
  renderCard: (item: T, variant: 'grid' | 'list') => React.ReactNode;
  renderFilters: (filters: Record<string, string>, setFilter: (key: string, val: string) => void) => React.ReactNode;
  filterKeys?: string[];
  perPage?: number;
}

export default function CatalogLayout<T extends { id: string }>({
  title,
  items,
  filterFn,
  renderCard,
  renderFilters,
  perPage = 20,
}: CatalogLayoutProps<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [page, setPage] = useState(1);

  const search = searchParams.get('search') || '';
  const filters: Record<string, string> = {};
  searchParams.forEach((val, key) => { if (key !== 'search') filters[key] = val; });

  const setSearch = (val: string) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set('search', val); else p.delete('search');
    setSearchParams(p, { replace: true });
    setPage(1);
  };

  const setFilter = (key: string, val: string) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val); else p.delete(key);
    setSearchParams(p, { replace: true });
    setPage(1);
  };

  const filtered = useMemo(() => filterFn(items, search, filters), [items, search, JSON.stringify(filters)]);
  const paged = filtered.slice(0, page * perPage);
  const hasMore = paged.length < filtered.length;

  const sortOptions = ['По цене ↑', 'По цене ↓', 'По площади', 'По дате'];
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <RedesignHeader />

      {/* Search bar */}
      <div className="border-b border-border bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center gap-3 max-w-[800px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Поиск по названию, адресу, району..."
                className="pl-9 h-10 bg-background text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Link
              to="/map"
              className="hidden sm:flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border bg-background text-sm font-medium hover:bg-secondary transition-colors shrink-0"
            >
              <MapPin className="w-4 h-4 text-primary" />
              На карте
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold">{title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} объектов</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="lg:hidden h-9" onClick={() => setShowMobileFilters(true)}>
              <SlidersHorizontal className="w-4 h-4 mr-1.5" /> Фильтры
            </Button>
            <div className="relative">
              <Button variant="outline" size="sm" className="h-9" onClick={() => setSortOpen(!sortOpen)}>
                Сортировка <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
              {sortOpen && (
                <div className="absolute top-full right-0 mt-1 py-1 bg-card border border-border rounded-xl shadow-lg z-30 min-w-[160px]">
                  {sortOptions.map(s => (
                    <button key={s} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary transition-colors" onClick={() => setSortOpen(false)}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-0.5 border border-border rounded-xl p-1 bg-muted/50">
              {([['grid', LayoutGrid], ['list', List]] as const).map(([mode, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    'p-2 rounded-lg transition-all duration-200',
                    view === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar (desktop) */}
          <aside className="hidden lg:block w-[260px] shrink-0">
            <div className="sticky top-20 space-y-4">
              {renderFilters(filters, setFilter)}
              <Link
                to="/map"
                className="flex items-center justify-center gap-2 w-full h-9 rounded-xl border border-border bg-background text-xs font-medium hover:bg-secondary transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-primary" />
                Показать на карте
              </Link>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {view === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {paged.map(item => renderCard(item, 'grid'))}
              </div>
            ) : (
              <div className="space-y-3">
                {paged.map(item => renderCard(item, 'list'))}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-16">
                <SlidersHorizontal className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Ничего не найдено</p>
                <p className="text-muted-foreground text-xs mt-1">Попробуйте изменить параметры</p>
              </div>
            )}

            {hasMore && (
              <div className="text-center mt-8">
                <Button variant="outline" className="min-w-[200px]" onClick={() => setPage(p => p + 1)}>
                  Показать ещё
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filters drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-[60] bg-background overflow-y-auto animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between h-14 px-4 border-b border-border sticky top-0 bg-background z-10">
            <span className="font-semibold text-sm">Фильтры</span>
            <button onClick={() => setShowMobileFilters(false)} className="w-10 h-10 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 pb-24">
            {renderFilters(filters, setFilter)}
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
            <Button className="w-full h-11" onClick={() => setShowMobileFilters(false)}>
              Показать {filtered.length} объектов
            </Button>
          </div>
        </div>
      )}

      <FooterSection reserveMobileNav />
    </div>
  );
}
