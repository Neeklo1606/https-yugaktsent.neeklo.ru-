/**
 * Пререндер разметки первого экрана (сборка: vite build --ssr src/ssr/prerender-entry.tsx).
 * Рендерим те же компоненты, что в браузере, с данными, загруженными заранее теми же
 * функциями запросов. Браузер показывает этот HTML до загрузки JS, а приложение стартует
 * с встроенными данными (window.__YUG_RQ__) — без цепочки «настройки → города → ЖК».
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider, dehydrate, type Query } from '@tanstack/react-query';
import { AuthProvider, type AuthState } from '@/shared/hooks/useAuth';
import RedesignIndex from '@/redesign/pages/RedesignIndex';
import RedesignCatalog from '@/redesign/pages/RedesignCatalog';
import RedesignComplex from '@/redesign/pages/RedesignComplex';

const noop = async () => {};
const guestAuth: AuthState = {
  authStatus: 'unauthenticated',
  authReady: true,
  isAuthenticated: false,
  user: null,
  loading: false,
  login: noop,
  loginWithTelegram: noop,
  linkTelegram: noop,
  linkEmail: noop,
  refreshMe: noop,
  register: noop,
  logout: noop,
};

function tree(qc: QueryClient, url: string) {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider value={guestAuth}>
        <StaticRouter location={url}>
          <Routes>
            <Route path="/" element={<RedesignIndex />} />
            <Route path="/catalog" element={<RedesignCatalog />} />
            <Route path="/complex/:slug" element={<RedesignComplex />} />
          </Routes>
        </StaticRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function pendingQueries(qc: QueryClient): Query[] {
  return qc
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.status === 'pending' && q.state.fetchStatus === 'idle' && q.options.queryFn && (q.options as { enabled?: unknown }).enabled !== false);
}

export type PrerenderResult = { html: string; state: unknown; fetched: string[]; failed: string[] };

/** До `passes` проходов: рендер → загрузка новых запросов (зависимые появляются после первых) → рендер */
export async function render(url: string, passes = 4): Promise<PrerenderResult> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 700, staleTime: Infinity } } });
  const fetched: string[] = [];
  const failed: string[] = [];
  let html = '';
  for (let i = 0; i < passes; i++) {
    html = renderToString(tree(qc, url));
    const todo = pendingQueries(qc).filter((q) => !fetched.includes(q.queryHash) && !failed.some((f) => f.startsWith(q.queryHash)));
    if (!todo.length) break;
    // По 4 запроса за раз: не создаём всплеск нагрузки на API при сборке
    for (let k = 0; k < todo.length; k += 4) {
      await Promise.all(
        todo.slice(k, k + 4).map((q) =>
          q.fetch().then(
            () => fetched.push(q.queryHash),
            (e: unknown) => failed.push(`${q.queryHash} ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`),
          ),
        ),
      );
    }
  }
  html = renderToString(tree(qc, url));
  // В браузер отдаём только успешные данные; ошибки клиент перезапросит сам
  const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' });
  return { html, state, fetched, failed };
}
