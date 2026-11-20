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
export function useHomeBlocks(opts?: { allRegions?: boolean }) {
  const { data: selectedRegionId } = useDefaultRegionId();
  // «Популярные ЖК» показывают все города агентства, остальное на главной — выбранный город
  const regionId = opts?.allRegions ? 'all' : selectedRegionId;

  return useQuery({
    queryKey: ['blocks', 'home', regionId],
    enabled: regionId != null,
    staleTime: 300_000,
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (regionId !== 'all') sp.set('region_id', String(regionId));
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

/** Порядок городов в подписи первого экрана — от моря вглубь, как в текстах сайта */
const CITY_ORDER = ['Анапа', 'Новороссийск', 'Краснодар', 'Майкоп'];

/**
 * Итог по всем городам для подписи над поиском: «Анапа, … · 16 ЖК и 11 178 квартир».
 * Берётся из того же кэша, что «Популярные ЖК» (allRegions) — лишнего запроса нет.
 */
export function useHomeBlocksTotals(): { cities: string[]; complexes: number; flats: number } | null {
  const { data } = useHomeBlocks({ allRegions: true });
  const rows = data?.data ?? [];
  if (rows.length === 0) return null;
  const flats = rows.reduce((sum, b) => sum + (b._count?.listings ?? 0), 0);
  const names = [...new Set(rows.map((b) => b.region?.name).filter((n): n is string => Boolean(n)))];
  names.sort((a, b) => (CITY_ORDER.indexOf(a) + 99) % 99 - ((CITY_ORDER.indexOf(b) + 99) % 99) || a.localeCompare(b, 'ru'));
  return { cities: names, complexes: rows.length, flats };
}
