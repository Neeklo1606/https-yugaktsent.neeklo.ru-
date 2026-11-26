import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';

type NewsProbe = { data?: unknown[]; meta?: { total?: number } };

/**
 * Есть ли в регионе хоть одна опубликованная новость. Тот же публичный список,
 * что и на /news, но одной записью; ответ кешируется на 10 минут — шапка, меню
 * и подвал на всех страницах делят один запрос.
 * Пока ответа нет — считаем, что новостей нет: ссылка не появится в пустой раздел.
 */
export function useHasPublishedNews(): boolean {
  const { data: regionId } = useDefaultRegionId();
  const { data } = useQuery({
    queryKey: ['news', 'exists', regionId ?? null],
    queryFn: () =>
      apiGet<NewsProbe>(`/news?page=1&per_page=1${regionId != null ? `&region_id=${regionId}` : ''}`),
    enabled: regionId != null,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  if (!data) return false;
  const total = data.meta?.total;
  if (typeof total === 'number') return total > 0;
  return (data.data?.length ?? 0) > 0;
}
