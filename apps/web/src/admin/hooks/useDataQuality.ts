import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import type { ApiBlockListRow } from '@/redesign/lib/blocks-from-api';
import { auditBlocks } from '@/admin/lib/data-quality';

/** Пробная загрузка обложки: так видно ЖК, чьё фото есть в базе, но не открывается у источника */
function probeImage(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/**
 * Аудит ЖК по публичному каталогу (без новых API и без записи).
 * Работает и в staging: читает те же данные, что видит посетитель.
 */
export function useDataQuality() {
  const { data: regionId } = useDefaultRegionId();
  const blocks = useQuery({
    queryKey: ['admin', 'data-quality', 'blocks', regionId],
    queryFn: () => apiGet<{ data: ApiBlockListRow[] }>(`/blocks?region_id=${regionId}&per_page=100&page=1`),
    enabled: regionId != null,
    staleTime: 5 * 60_000,
  });
  const rows = useMemo(() => blocks.data?.data ?? [], [blocks.data]);
  const [unreachable, setUnreachable] = useState<ReadonlySet<number>>(() => new Set());
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const withCover = rows.filter((b) => b.images?.[0]?.url);
    if (!withCover.length) return;
    let cancelled = false;
    setProbing(true);
    void Promise.all(withCover.map(async (b) => ((await probeImage(b.images![0].url)) ? null : b.id))).then((ids) => {
      if (cancelled) return;
      setUnreachable(new Set(ids.filter((x): x is number => x != null)));
      setProbing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const issues = useMemo(() => auditBlocks(rows, unreachable), [rows, unreachable]);
  return { rows, issues, isLoading: blocks.isLoading, isError: blocks.isError, probing };
}
