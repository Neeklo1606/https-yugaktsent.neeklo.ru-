/**
 * Предзагрузка кода страниц по намерению пользователя (наведение, касание, фокус).
 * Пути импорта те же, что у ленивых маршрутов в App.tsx, — бандлер отдаёт тот же чанк,
 * и к моменту клика страница уже в кэше: переход ощущается мгновенным (ТЗ v3, 7).
 */
const ROUTE_CHUNKS: { test: (path: string) => boolean; load: () => Promise<unknown> }[] = [
  { test: (p) => p.startsWith('/complex/'), load: () => import('@/redesign/pages/RedesignComplex') },
  { test: (p) => p.startsWith('/apartment/'), load: () => import('@/redesign/pages/RedesignApartment') },
  { test: (p) => p.startsWith('/listing/'), load: () => import('@/redesign/pages/RedesignListingDetail') },
  { test: (p) => p.startsWith('/catalog'), load: () => import('@/redesign/pages/RedesignCatalog') },
  { test: (p) => p.startsWith('/map'), load: () => import('@/redesign/pages/RedesignMap') },
  { test: (p) => p.startsWith('/experts/'), load: () => import('@/pages/ExpertPage') },
];

const requested = new Set<number>();

/** Скачать чанк страницы заранее. Повторные вызовы и ошибки сети не мешают переходу. */
export function prefetchRoute(path: string): void {
  // Экономим трафик, если пользователь включил режим экономии данных
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const idx = ROUTE_CHUNKS.findIndex((r) => r.test(path));
  if (idx < 0 || requested.has(idx)) return;
  requested.add(idx);
  void ROUTE_CHUNKS[idx].load().catch(() => requested.delete(idx));
}

/** Обработчики для ссылки: <Link {...prefetchHandlers('/complex/x')} /> */
export function prefetchHandlers(path: string) {
  const run = () => prefetchRoute(path);
  return { onMouseEnter: run, onTouchStart: run, onFocus: run };
}
