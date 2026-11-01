import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Link2, Loader2, Plus, Radar, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/shared/hooks/useAuth';
import AdminLoadingState from '@/admin/components/AdminLoadingState';

type FeedRegion = {
  id: number;
  code: string;
  name: string;
};

type FeedLinkRow = {
  id: number;
  regionId: number;
  name: string;
  feedUrl: string;
  blockName: string | null;
  provider: string;
  isEnabled: boolean;
  sortOrder: number;
  lastSyncedAt: string | null;
  lastSyncStatus: 'ok' | 'empty' | 'error' | null;
  lastSyncTotal: number | null;
  lastSyncCreated: number | null;
  lastSyncUpdated: number | null;
  lastSyncErrors: number | null;
  createdAt: string;
  updatedAt: string;
  region: FeedRegion;
};

type ProbeResult = {
  ok: boolean;
  httpStatus: number;
  offerCount: number;
  durationMs: number;
  bytes?: number;
  error?: string;
};

type DraftMap = Record<
  number,
  Partial<Pick<FeedLinkRow, 'name' | 'feedUrl' | 'blockName' | 'provider' | 'isEnabled' | 'sortOrder' | 'regionId'>>
>;

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU');
}

/**
 * Ждёт внеочередной синхронизации: фид новый или изменён после прогона.
 * Служба синхронизации проверяет такие раз в пару минут (та же логика в profitbase-sync).
 */
function isSyncPending(row: FeedLinkRow) {
  if (!row.isEnabled) return false;
  if (!row.lastSyncedAt) return true;
  return new Date(row.updatedAt).getTime() - new Date(row.lastSyncedAt).getTime() > 5000;
}

function FeedSyncStatus({ row, probe }: { row: FeedLinkRow; probe?: ProbeResult }) {
  const when = formatDate(row.lastSyncedAt);
  const status = row.lastSyncStatus;

  if (isSyncPending(row)) {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
          <Loader2 className="w-3 h-3 animate-spin" />
          В очереди
        </span>
        <div className="text-xs text-muted-foreground whitespace-normal">Объекты появятся на сайте в течение нескольких минут</div>
        {when ? <div className="text-xs text-muted-foreground">Прошлая: {when}</div> : null}
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-medium">
          Пустой фид
        </span>
        {when ? <div className="text-xs text-muted-foreground">{when}</div> : null}
        {probe?.ok ? (
          <div className="text-xs text-muted-foreground">В XML: {probe.offerCount} объектов</div>
        ) : null}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
          Ошибки синхронизации
        </span>
        {when ? <div className="text-xs text-muted-foreground">{when}</div> : null}
        {row.lastSyncErrors != null && row.lastSyncErrors > 0 ? (
          <div className="text-xs text-destructive">{row.lastSyncErrors} ошибок</div>
        ) : null}
      </div>
    );
  }

  if (status === 'ok') {
    const parts: string[] = [];
    if (row.lastSyncCreated) parts.push(`+${row.lastSyncCreated} новых`);
    if (row.lastSyncUpdated) parts.push(`${row.lastSyncUpdated} обновлено`);
    const summary =
      parts.length > 0
        ? parts.join(', ')
        : row.lastSyncTotal != null
          ? `${row.lastSyncTotal} в фиде`
          : 'Синхронизировано';

    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
          OK
        </span>
        <div className="text-xs text-foreground">{summary}</div>
        {when ? <div className="text-xs text-muted-foreground">{when}</div> : null}
      </div>
    );
  }

  if (probe?.ok) {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
          Не синхронизирован
        </span>
        <div className="text-xs text-primary">В фиде: {probe.offerCount} объектов</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <span className="inline-flex rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
        Ожидает синхронизации
      </span>
      {when ? <div className="text-xs text-muted-foreground">{when}</div> : null}
    </div>
  );
}

export default function AdminFeedLinks() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === 'admin';

  const [regionIdFilter, setRegionIdFilter] = useState<number | ''>('');
  const [draft, setDraft] = useState<DraftMap>({});
  const [probingId, setProbingId] = useState<number | null>(null);
  const [probeResults, setProbeResults] = useState<Record<number, ProbeResult>>({});

  const [newName, setNewName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newBlockName, setNewBlockName] = useState('');
  const [newRegionId, setNewRegionId] = useState<number | ''>('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (regionIdFilter !== '') p.set('region_id', String(regionIdFilter));
    return p.toString();
  }, [regionIdFilter]);

  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ['admin', 'regions', 'for-feed-links'],
    queryFn: () => apiGet<FeedRegion[]>('/admin/regions'),
    staleTime: 60_000,
  });

  const { data: feeds = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'feed-links', query],
    queryFn: () => apiGet<FeedLinkRow[]>(`/admin/feed-links${query ? `?${query}` : ''}`),
    staleTime: 10_000,
    // Пока фид в очереди — обновляем статус сами, без перезагрузки страницы
    refetchInterval: (q) => ((q.state.data ?? []).some(isSyncPending) ? 20_000 : false),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (newRegionId === '') throw new Error('Выберите регион');
      const name = newName.trim();
      const feedUrl = newFeedUrl.trim();
      if (!name) throw new Error('Введите название фида');
      if (!feedUrl) throw new Error('Введите URL фида');
      return apiPost<FeedLinkRow>('/admin/feed-links', {
        regionId: newRegionId,
        name,
        feedUrl,
        blockName: newBlockName.trim() || undefined,
        provider: 'profitbase',
        isEnabled: true,
      });
    },
    onSuccess: async () => {
      toast.success('Фид добавлен');
      setNewName('');
      setNewFeedUrl('');
      setNewBlockName('');
      await qc.invalidateQueries({ queryKey: ['admin', 'feed-links'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка добавления');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(draft);
      for (const [id, patch] of entries) {
        if (!Object.keys(patch).length) continue;
        await apiPatch<FeedLinkRow>(`/admin/feed-links/${id}`, patch);
      }
    },
    onSuccess: async () => {
      setDraft({});
      toast.success('Изменения сохранены');
      await qc.invalidateQueries({ queryKey: ['admin', 'feed-links'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/feed-links/${id}`),
    onSuccess: async () => {
      toast.success('Фид удалён');
      await qc.invalidateQueries({ queryKey: ['admin', 'feed-links'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    },
  });

  const syncNowMutation = useMutation({
    // Любое изменение записи ставит фид в очередь синхронизации
    mutationFn: (row: FeedLinkRow) => apiPatch<FeedLinkRow>(`/admin/feed-links/${row.id}`, { sortOrder: row.sortOrder }),
    onSuccess: async () => {
      toast.success('Фид поставлен в очередь синхронизации');
      await qc.invalidateQueries({ queryKey: ['admin', 'feed-links'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Не удалось запустить синхронизацию');
    },
  });

  const probeMutation = useMutation({
    mutationFn: (id: number) => apiGet<ProbeResult>(`/admin/feed-links/${id}/probe`),
    onMutate: (id) => setProbingId(id),
    onSuccess: (result, id) => {
      setProbeResults((prev) => ({ ...prev, [id]: result }));
      if (result.ok) {
        toast.success(`Фид доступен: ${result.offerCount} объектов`);
      } else {
        toast.error(result.error ?? 'Фид недоступен');
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка проверки');
    },
    onSettled: () => setProbingId(null),
  });

  const getRow = (row: FeedLinkRow) => {
    const patch = draft[row.id] ?? {};
    return {
      ...row,
      name: patch.name ?? row.name,
      feedUrl: patch.feedUrl ?? row.feedUrl,
      blockName: patch.blockName ?? row.blockName,
      provider: patch.provider ?? row.provider,
      isEnabled: patch.isEnabled ?? row.isEnabled,
      sortOrder: patch.sortOrder ?? row.sortOrder,
      regionId: patch.regionId ?? row.regionId,
    };
  };

  const patchRow = (id: number, patch: DraftMap[number]) => {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const hasDraft = Object.values(draft).some((p) => Object.keys(p).length > 0);

  if (isLoading || regionsLoading) return <AdminLoadingState label="Загрузка фидов…" />;

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold inline-flex items-center gap-2">
            <Link2 className="w-6 h-6 text-primary" />
            Ссылки на фиды
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            XML-фиды застройщиков (Profitbase XML и ДомКлик). Каждые 6 часов служба{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">profitbase-sync</code> обновляет цены, статусы и
            планировки, скачивает фото на наш сервер и снимает с сайта проданные лоты. Новый или изменённый фид
            синхронизируется в течение нескольких минут; ЖК создаётся автоматически по названию.
            TrendAgent-фиды настраиваются в{' '}
            <Link to="/admin/regions" className="text-primary hover:underline">регионах</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/feed-import">
              <Download className="w-4 h-4 mr-1.5" />
              Импорт фидов
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!hasDraft || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Сохранить
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Не удалось загрузить фиды'}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Регион</span>
          <select
            className="block h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
            value={regionIdFilter}
            onChange={(e) => setRegionIdFilter(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Все регионы</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="px-3 py-2 font-medium">Регион</th>
                <th className="px-3 py-2 font-medium min-w-[220px]">URL фида</th>
                <th className="px-3 py-2 font-medium">ЖК / блок</th>
                <th className="px-3 py-2 font-medium">Вкл.</th>
                <th className="px-3 py-2 font-medium">Синхр.</th>
                <th className="px-3 py-2 font-medium w-28" />
              </tr>
            </thead>
            <tbody>
              {feeds.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Фиды не добавлены. Создайте первый фид ниже.
                  </td>
                </tr>
              ) : (
                feeds.map((row) => {
                  const d = getRow(row);
                  const probe = probeResults[row.id];
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2">
                        <Input
                          value={d.name}
                          onChange={(e) => patchRow(row.id, { name: e.target.value })}
                          className="h-9 min-w-[140px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[120px]"
                          value={d.regionId}
                          onChange={(e) => patchRow(row.id, { regionId: Number(e.target.value) })}
                        >
                          {regions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={d.feedUrl}
                          onChange={(e) => patchRow(row.id, { feedUrl: e.target.value })}
                          className="h-9 font-mono text-xs min-w-[220px]"
                        />
                        <a
                          href={d.feedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                        >
                          Открыть <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={d.blockName ?? ''}
                          placeholder={d.name}
                          onChange={(e) => patchRow(row.id, { blockName: e.target.value })}
                          className="h-9 min-w-[140px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={d.isEnabled}
                          onChange={(e) => patchRow(row.id, { isEnabled: e.target.checked })}
                          className="h-4 w-4 rounded border-input"
                          aria-label={`Фид ${d.name} включён`}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap min-w-[140px]">
                        <FeedSyncStatus row={row} probe={probe} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={probingId === row.id}
                            onClick={() => probeMutation.mutate(row.id)}
                          >
                            {probingId === row.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Radar className="w-3.5 h-3.5" />
                            )}
                            <span className="sr-only">Проверить доступность фида</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            title="Синхронизировать сейчас"
                            disabled={!row.isEnabled || isSyncPending(row) || syncNowMutation.isPending}
                            onClick={() => syncNowMutation.mutate(row)}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span className="sr-only">Синхронизировать сейчас</span>
                          </Button>
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (window.confirm(`Удалить фид «${row.name}»?`)) {
                                  deleteMutation.mutate(row.id);
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
        <h2 className="font-semibold inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Добавить фид
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">Название</span>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Хозяин Морей" />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">Регион</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={newRegionId}
              onChange={(e) => setNewRegionId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Выберите регион</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-muted-foreground">URL фида (Profitbase XML или ДомКлик)</span>
            <Input
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="https://pb....profitbase.ru/export/profitbase_xml/..."
              className="font-mono text-xs"
            />
          </label>
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-muted-foreground">Название ЖК / блока (куда импортировать)</span>
            <Input
              value={newBlockName}
              onChange={(e) => setNewBlockName(e.target.value)}
              placeholder="ЖК Хозяин Морей"
            />
          </label>
        </div>
        <Button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-1.5" />
          )}
          Добавить
        </Button>
      </div>
    </div>
  );
}
