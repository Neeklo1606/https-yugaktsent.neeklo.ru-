import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { buildListingsSearchParams } from '@/redesign/lib/catalog-api-params';
import { OBJECT_TYPE_TABS } from '@/redesign/lib/catalog-filter-config';
import { defaultFilters, type MarketType, type ObjectType } from '@/redesign/data/types';

/** Вторичка на MVP только в Анапе (ТЗ v3, 4.3) */
const SECONDARY_REGION_CODES = new Set(['anapa']);
/** Типы новостроек по ТЗ: квартиры и апартаменты. Апартаментов в модели данных пока нет. */
const NEW_BUILDING_TYPES: ObjectType[] = ['apartments'];

export type HomeFilterOption<T extends string> = { value: T; label: string };

/**
 * Что можно предложить в фильтре главной, исходя из реальных данных:
 * пустые рынки и типы не показываем, чтобы пользователь не упирался в «ничего не найдено».
 * Ключи запросов совпадают с каталогом — данные берутся из общего кэша.
 */
export function useHomeFilterOptions(market: MarketType) {
  const { data: regionId, rows: regionRows, setStoredRegionId } = useDefaultRegionId();
  const region = regionRows?.find((r) => r.id === regionId);
  const secondaryAllowedHere = SECONDARY_REGION_CODES.has((region?.code ?? '').toLowerCase());

  const kindCounts = useQuery({
    queryKey: ['stats', 'listing-kind-counts', regionId],
    queryFn: () => apiGet<Record<string, number>>(`/stats/listing-kind-counts?region_id=${regionId}`),
    enabled: regionId != null,
    staleTime: 60_000,
  });

  const secondaryCount = useQuery({
    queryKey: ['listings', 'secondary-availability', regionId],
    queryFn: async () => {
      const sp = buildListingsSearchParams({
        filters: { ...defaultFilters, objectType: 'apartments', marketType: 'secondary' },
        regionId,
        kind: 'APARTMENT',
        page: 1,
        perPage: 1,
      });
      const res = await apiGet<{ meta?: { total?: number } }>(`/listings?${sp}`);
      return res.meta?.total ?? 0;
    },
    enabled: regionId != null && secondaryAllowedHere,
    staleTime: 5 * 60 * 1000,
  });

  const markets = useMemo<HomeFilterOption<MarketType>[]>(() => {
    const list: HomeFilterOption<MarketType>[] = [{ value: 'new', label: 'Новостройки' }];
    if (secondaryAllowedHere && (secondaryCount.data ?? 0) > 0) list.push({ value: 'secondary', label: 'Вторичка' });
    return list;
  }, [secondaryAllowedHere, secondaryCount.data]);

  const types = useMemo<HomeFilterOption<ObjectType>[]>(() => {
    const counts = kindCounts.data ?? {};
    const tabs = market === 'secondary' ? OBJECT_TYPE_TABS : OBJECT_TYPE_TABS.filter((t) => NEW_BUILDING_TYPES.includes(t.type));
    const withData = tabs.filter((t) => (counts[t.countKey] ?? 0) > 0);
    // Счётчики ещё не пришли — показываем базовый тип, а не весь список
    const list = withData.length > 0 ? withData : tabs.slice(0, 1);
    return list.map((t) => ({ value: t.type, label: t.label }));
  }, [kindCounts.data, market]);

  return {
    regionId,
    regionRows: regionRows ?? [],
    regionName: region?.name,
    setRegionId: setStoredRegionId,
    markets,
    types,
  };
}
