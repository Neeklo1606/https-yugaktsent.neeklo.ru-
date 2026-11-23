import { lazy, Suspense, type ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import type MapSearchComponent from '@/redesign/components/MapSearch';

/** Карта и скрипт Яндекса грузятся только когда карта реально на экране */
const MapSearch = lazy(() => import('@/redesign/components/MapSearch'));

type MapSearchProps = ComponentProps<typeof MapSearchComponent>;

const MapFallback = () => (
  <div
    className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted"
    role="status"
    aria-live="polite"
  >
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
    <span className="text-xs text-muted-foreground">Загрузка карты…</span>
  </div>
);

export const LazyMapSearch = (props: MapSearchProps) => (
  <Suspense fallback={<MapFallback />}>
    <MapSearch {...props} />
  </Suspense>
);

type PanelProps = MapSearchProps & {
  /** Сколько ЖК по фильтрам всего (на карте может быть меньше — лимит запроса) */
  total?: number | null;
};

/**
 * Карта справа от списка на широком экране: липкая, на высоту окна минус шапка.
 * Родитель монтирует панель только на ≥1280 px — на телефоне скрипт карт не грузится.
 */
const CatalogMapPanel = ({ total, ...mapProps }: PanelProps) => {
  const shown = mapProps.complexes.length;
  return (
    <aside aria-label="Жилые комплексы на карте" className="w-[40%] max-w-[880px] shrink-0">
      <div className="sticky top-[88px] h-[calc(100dvh-104px)] min-h-[420px]">
        <LazyMapSearch {...mapProps} compact useViewportApi={false} />
        {total != null && total > shown && shown > 0 ? (
          <p className="pointer-events-none absolute left-3 top-3 z-[6] rounded-lg bg-card/95 px-2.5 py-1 text-[12px] text-muted-foreground shadow-card">
            На карте {shown.toLocaleString('ru-RU')} из {total.toLocaleString('ru-RU')} — уточните фильтры
          </p>
        ) : null}
      </div>
    </aside>
  );
};

export default CatalogMapPanel;
