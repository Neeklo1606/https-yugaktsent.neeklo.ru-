import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/shared/hooks/useAuth';

type Health = { status: string; services?: { database?: string } };

/**
 * Тонкая полоска под шапкой: проверка доступности API (Sprint 2 — первый живой запрос).
 */
export function ApiConnectionStrip() {
  if (import.meta.env.PROD) return null;

  const { isAuthenticated, user, loading } = useAuth();
  const canSeeStrip = isAuthenticated && user?.role === 'admin';

  const q = useQuery({
    queryKey: ['api', 'health'],
    queryFn: () => apiGet<Health>('/health'),
    staleTime: 60_000,
    retry: 1,
    enabled: canSeeStrip,
  });

  if (loading || !canSeeStrip) return null;

  if (q.isPending) {
    return (
      <div className="bg-muted/80 text-muted-foreground text-center text-xs py-1.5 px-4">
        Проверка API…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="bg-destructive/15 text-destructive text-center text-xs py-1.5 px-4">
        API недоступен (запустите NestJS и прокси Vite для <code className="mx-1">/api</code>)
      </div>
    );
  }

  const ok = q.data?.status === 'ok';
  return (
    <div
      className={
        ok
          ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-center text-xs py-1.5 px-4'
          : 'bg-warning-soft text-warning text-center text-xs py-1.5 px-4'
      }
    >
      API: {q.data?.status ?? '—'}
      {q.data?.services?.database ? ` · БД: ${q.data.services.database}` : null}
    </div>
  );
}
