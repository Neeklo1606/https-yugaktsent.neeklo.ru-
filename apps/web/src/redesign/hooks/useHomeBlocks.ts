import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { persistedQueryOptions, writePersisted } from '@/shared/lib/persisted-query';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import type { ApiBlockListRow } from '@/redesign/lib/blocks-from-api';

/**
 * Один запрос комплексов на всю главную.
 *
 * Раньше первый экран и блок «Популярные ЖК» ходили в /blocks каждый сам
 * за себя: два одинаковых по сути запроса подряд задерживали отрисовку
 * первого экрана. Теперь оба читают из одного кэша React Query.
 */
export function useHomeBlocks() {
  const { data: regionId } = useDefaultRegionId();

  return useQuery({
    queryKey: ['blocks', 'home', regionId],
    enabled: regionId != null,
    staleTime: 300_000,
    queryFn: async () => {
      const sp = new URLSearchParams();
      sp.set('region_id', String(regionId));
      sp.set('per_page', '24');
      sp.set('page', '1');
      sp.set('sort', 'created_desc');
      sp.set('require_active_listings', 'true');
      return writePersisted(`home-blocks-${regionId}`, await apiGet<{ data: ApiBlockListRow[] }>(`/blocks?${sp}`));
    },
    // Повторный визит: первый экран рисуется сразу из кэша, свежий список — в фоне
    ...persistedQueryOptions<{ data: ApiBlockListRow[] }>(`home-blocks-${regionId}`),
  });
}
