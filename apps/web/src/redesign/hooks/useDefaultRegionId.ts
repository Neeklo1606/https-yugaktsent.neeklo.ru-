import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { persistedQueryOptions, writePersisted } from '@/shared/lib/persisted-query';

export type RegionRow = {
  id: number;
  code: string;
  name?: string;
  baseUrl?: string | null;
  publicSiteUrl?: string | null;
  mapCenterLat?: number | string | null;
  mapCenterLng?: number | string | null;
  lastImportedAt?: string | null;
};

const STORAGE_KEY = 'lg_region_id';

/** Синхронизирует все экземпляры useDefaultRegionId при смене города (sessionStorage). */
let regionPickRevision = 0;
const regionPickListeners = new Set<() => void>();

function subscribeRegionPick(listener: () => void) {
  regionPickListeners.add(listener);
  return () => regionPickListeners.delete(listener);
}

function getRegionPickSnapshot() {
  return regionPickRevision;
}

function bumpRegionPickRevision() {
  regionPickRevision += 1;
  regionPickListeners.forEach((l) => l());
}

function readStoredId(): number | null {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function pickDefaultId(rows: RegionRow[]): number | undefined {
  if (!rows.length) return undefined;
  if (rows.length === 1) return rows[0]?.id;

  const envCode = (import.meta.env.VITE_DEFAULT_REGION_CODE as string | undefined)
    ?.trim()
    .toLowerCase();
  if (envCode) {
    const fromEnv = rows.find((r) => (r.code ?? '').toLowerCase() === envCode);
    if (fromEnv) return fromEnv.id;
  }

  const msk =
    rows.find((r) => (r.code ?? '').toLowerCase() === 'msk') ??
    rows.find((r) => r.name?.trim() === 'Москва');
  return msk?.id ?? rows[0]?.id;
}

/**
 * Регион для публичных запросов: из sessionStorage (если включён в /regions), иначе Москва (msk), иначе первый регион.
 * `setStoredRegionId(null)` — сброс на Москву по умолчанию.
 */
export function useDefaultRegionId() {
  const pickRev = useSyncExternalStore(subscribeRegionPick, getRegionPickSnapshot, getRegionPickSnapshot);

  const base = useQuery({
    queryKey: ['regions'],
    queryFn: async () => writePersisted('regions', await apiGet<RegionRow[]>('/regions')),
    staleTime: 60 * 60 * 1000,
    // Повторный визит: регион известен сразу, запрос ЖК не ждёт /regions
    ...persistedQueryOptions<RegionRow[]>('regions'),
  });

  const rows = base.data;

  const data = useMemo(() => {
    if (!rows?.length) return undefined;
    const stored = readStoredId();
    if (stored != null && rows.some((r) => r.id === stored)) return stored;
    return pickDefaultId(rows);
  }, [rows, pickRev]);

  const setStoredRegionId = useCallback((id: number | null) => {
    try {
      if (id == null) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      /* ignore */
    }
    bumpRegionPickRevision();
  }, []);

  return { ...base, data, rows, setStoredRegionId };
}
