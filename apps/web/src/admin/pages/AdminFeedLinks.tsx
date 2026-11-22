import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, History, Link2, Loader2, Pencil, Plus, Radar, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/shared/hooks/useAuth';
import AdminLoadingState from '@/admin/components/AdminLoadingState';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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
  lastSyncError: string | null;
  mediaMode: 'remote' | 'local';
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
  format?: string;
  error?: string;
};

const FORMAT_LABEL: Record<string, string> = {
  'profitbase/jcat': 'Profitbase / JCAT',
  cian: 'ЦИАН',
  domclick: 'ДомКлик',
  xml: 'XML',
  unknown: 'не распознан',
};

const MEDIA_LABEL: Record<FeedLinkRow['mediaMode'], string> = {
  remote: 'По ссылке источника',
  local: 'Копировать к нам',
};

type DraftMap = Record<
  number,
  Partial<Pick<FeedLinkRow, 'name' | 'feedUrl' | 'blockName' | 'provider' | 'isEnabled' | 'sortOrder' | 'regionId' | 'mediaMode'>>
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
          <div className="text-xs text-muted-foreground">В файле: {probe.offerCount} объектов</div>
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
        {row.lastSyncError ? (
          <div className="max-w-[220px] whitespace-normal break-words text-xs text-destructive" title={row.lastSyncError}>
            {row.lastSyncError.length > 140 ? `${row.lastSyncError.slice(0, 140)}…` : row.lastSyncError}
          </div>
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
        <div className="text-xs text-primary">
          В фиде: {probe.offerCount} объектов{probe.format ? ` · ${FORMAT_LABEL[probe.format] ?? probe.format}` : ''}
        </div>
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

type FeedOverview = {
  feedLinkId: number;
  block: { id: number; slug: string; name: string; status: string; builder: string | null; photos: number } | null;
  listings: { active: number; reserved: number; sold: number; total: number };
};

type FeedHistoryRow = {
  id: string;
  at: string;
  status: 'ok' | 'empty' | 'error' | null;
  total: number | null;
  created: number | null;
  updated: number | null;
  errors: number | null;
  error: string | null;
};

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  active,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        active && 'border-border bg-background text-foreground',
        danger && 'hover:text-destructive',
      )}
    >
      {icon}
    </button>
  );
}

const HISTORY_LABEL: Record<string, { text: string; cls: string }> = {
  ok: { text: 'Успешно', cls: 'bg-primary/10 text-primary' },
  empty: { text: 'Пустой фид', cls: 'bg-amber-100 text-amber-900' },
  error: { text: 'Ошибка', cls: 'bg-destructive/10 text-destructive' },
};

/** История прогонов синхронизации одного фида (ведётся с 23.11.2026) */
function FeedHistory({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'feed-links', id, 'history'],
    queryFn: () => apiGet<FeedHistoryRow[]>(`/admin/feed-links/${id}/history`),
    staleTime: 15_000,
  });
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-2 text-sm font-semibold">История обновлений</p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Загрузка…</p>
      ) : error ? (
        <p className="text-xs text-destructive">Не удалось загрузить историю</p>
      ) : !data?.length ? (
        <p className="text-xs text-muted-foreground">Записей пока нет — история ведётся с 23 ноября, появится после ближайшего обновления.</p>
      ) : (
        <ul className="divide-y text-xs">
          {data.map((h) => {
            const st = HISTORY_LABEL[h.status ?? ''] ?? { text: 'Отмечено', cls: 'bg-muted text-muted-foreground' };
            return (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-32 shrink-0 tabular-nums text-muted-foreground">
                  {new Date(h.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 font-medium', st.cls)}>{st.text}</span>
                <span>
                  {[
                    h.total != null ? `${h.total} в фиде` : '',
                    h.created ? `+${h.created} новых` : '',
                    h.updated ? `${h.updated} обновлено` : '',
                    h.errors ? `${h.errors} ошибок` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {h.error ? <span className="basis-full text-destructive">{h.error}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'error' | 'noblock' | 'off'>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  const [newName, setNewName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newBlockName, setNewBlockName] = useState('');
  const [newRegionId, setNewRegionId] = useState<number | ''>('');
  const [newMediaMode, setNewMediaMode] = useState<FeedLinkRow['mediaMode']>('remote');

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

  const { data: overview = [] } = useQuery({
    queryKey: ['admin', 'feed-links', 'overview'],
    queryFn: () => apiGet<FeedOverview[]>('/admin/feed-links/overview'),
    staleTime: 30_000,
  });

  // Переключатель «Обновлять» сохраняется сразу, без кнопки «Сохранить»
  const toggleMutation = useMutation({
    mutationFn: (v: { id: number; isEnabled: boolean }) => apiPatch<FeedLinkRow>(`/admin/feed-links/${v.id}`, { isEnabled: v.isEnabled }),
    onSuccess: async (_r, v) => {
      toast.success(v.isEnabled ? 'Фид снова обновляется' : 'Обновление фида остановлено — ЖК остаётся на сайте');
      await qc.invalidateQueries({ queryKey: ['admin', 'feed-links'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось изменить'),
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
        mediaMode: newMediaMode,
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
      setEditingId(null);
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
        toast.success(`Фид доступен: ${result.offerCount} объектов${result.format ? ` (${FORMAT_LABEL[result.format] ?? result.format})` : ''}`);
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
      mediaMode: patch.mediaMode ?? row.mediaMode,
    };
  };

  const patchRow = (id: number, patch: DraftMap[number]) => {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const hasDraft = Object.values(draft).some((p) => Object.keys(p).length > 0);

  if (isLoading || regionsLoading) return <AdminLoadingState label="Загрузка фидов…" />;

  const overviewById = new Map(overview.map((o) => [o.feedLinkId, o]));
  const needle = search.trim().toLowerCase();
  const visibleFeeds = feeds.filter((row) => {
    const o = overviewById.get(row.id);
    if (statusFilter === 'error' && row.lastSyncStatus !== 'error') return false;
    if (statusFilter === 'off' && row.isEnabled) return false;
    if (statusFilter === 'noblock' && o?.block) return false;
    if (!needle) return true;
    return [row.name, row.blockName, o?.block?.name, o?.block?.builder, row.region?.name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });
  const totals = {
    feeds: feeds.length,
    enabled: feeds.filter((f) => f.isEnabled).length,
    errors: feeds.filter((f) => f.lastSyncStatus === 'error').length,
    flats: overview.reduce((s, o) => s + o.listings.active, 0),
    noBlock: overview.filter((o) => !o.block).length,
  };
  const lastRun = feeds.reduce<string | null>((m, f) => (f.lastSyncedAt && (!m || f.lastSyncedAt > m) ? f.lastSyncedAt : m), null);

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold inline-flex items-center gap-2">
            <Link2 className="w-6 h-6 text-primary" />
            Фиды и источники
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Каждая строка — выгрузка застройщика и ЖК, который из неё получился на сайте. Служба обновляет цены,
            статусы и планировки каждые 6 часов и снимает проданные квартиры. Ссылки с токенами видны только здесь.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/feed-import">
              <Download className="w-4 h-4 mr-1.5" />
              Импорт фидов
            </Link>
          </Button>
          <Button asChild size="sm">
            <a href="#add-feed">
              <Plus className="w-4 h-4 mr-1.5" />
              Добавить фид
            </a>
          </Button>
        </div>
      </div>

      {/* Сводка: всё главное одним взглядом */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'Фидов', value: `${totals.feeds}`, hint: `${totals.enabled} обновляются` },
          { label: 'Квартир в продаже', value: totals.flats.toLocaleString('ru-RU'), hint: 'из всех фидов' },
          { label: 'С ошибкой', value: `${totals.errors}`, hint: totals.errors ? 'нужно проверить' : 'всё в порядке', tone: totals.errors ? 'bad' : 'good' },
          { label: 'Без ЖК на сайте', value: `${totals.noBlock}`, hint: totals.noBlock ? 'ещё не синхронизированы' : 'все связаны', tone: totals.noBlock ? 'warn' : 'good' },
          { label: 'Последнее обновление', value: lastRun ? new Date(lastRun).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—', hint: 'по всем фидам' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-3.5">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p
              className={cn(
                'mt-1 text-xl font-bold tabular-nums',
                c.tone === 'bad' && 'text-destructive',
                c.tone === 'warn' && 'text-amber-700',
              )}
            >
              {c.value}
            </p>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Не удалось загрузить фиды'}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ЖК, фид или застройщик"
            className="h-10 pl-9"
            aria-label="Поиск по фидам"
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={regionIdFilter}
          onChange={(e) => setRegionIdFilter(e.target.value ? Number(e.target.value) : '')}
          aria-label="Регион"
        >
          <option value="">Все города</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Фильтр по состоянию">
          {(
            [
              ['all', 'Все'],
              ['error', `С ошибкой${totals.errors ? ` · ${totals.errors}` : ''}`],
              ['noblock', 'Без ЖК'],
              ['off', 'Выключены'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={statusFilter === key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                statusFilter === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">Показано {visibleFeeds.length} из {feeds.length}</span>
      </div>

      <div className="rounded-xl border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium min-w-[220px]">ЖК на сайте</th>
                <th className="px-3 py-2.5 font-medium">Город</th>
                <th className="px-3 py-2.5 font-medium">Застройщик</th>
                <th className="px-3 py-2.5 font-medium text-right">Квартир</th>
                <th className="px-3 py-2.5 font-medium text-right">Фото ЖК</th>
                <th className="px-3 py-2.5 font-medium min-w-[170px]">Обновление</th>
                <th className="px-3 py-2.5 font-medium">Обновлять</th>
                <th className="px-3 py-2.5 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleFeeds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    {feeds.length === 0 ? 'Фиды не добавлены. Добавьте первый ниже.' : 'Ничего не найдено — измените поиск или фильтр.'}
                  </td>
                </tr>
              ) : (
                visibleFeeds.map((row) => {
                  const d = getRow(row);
                  const o = overviewById.get(row.id);
                  const probe = probeResults[row.id];
                  const editing = editingId === row.id;
                  const showHistory = historyId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className={cn('border-t align-top transition-colors hover:bg-muted/30', (editing || showHistory) && 'bg-muted/30')}>
                        <td className="px-3 py-3">
                          <div className="font-semibold leading-snug">{o?.block?.name ?? d.blockName ?? d.name}</div>
                          {o?.block ? (
                            <a
                              href={`/complex/${o.block.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              Открыть на сайте <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <div className="mt-0.5 text-xs text-amber-700">ЖК появится после первой синхронизации</div>
                          )}
                          {d.name !== (o?.block?.name ?? d.blockName ?? d.name) ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">Фид: {d.name}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{row.region?.name ?? '—'}</td>
                        <td className="px-3 py-3">{o?.block?.builder ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <div className="font-semibold">{(o?.listings.active ?? 0).toLocaleString('ru-RU')}</div>
                          {o && (o.listings.reserved || o.listings.sold) ? (
                            <div className="text-xs text-muted-foreground">
                              {o.listings.reserved ? `бронь ${o.listings.reserved}` : ''}
                              {o.listings.reserved && o.listings.sold ? ' · ' : ''}
                              {o.listings.sold ? `продано ${o.listings.sold}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {o?.block ? (
                            o.block.photos > 0 ? (
                              o.block.photos
                            ) : (
                              <span className="text-xs text-amber-700">нет фото</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs min-w-[170px]">
                          <FeedSyncStatus row={row} probe={probe} />
                        </td>
                        <td className="px-3 py-3">
                          <Switch
                            checked={row.isEnabled}
                            disabled={toggleMutation.isPending && toggleMutation.variables?.id === row.id}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, isEnabled: v })}
                            aria-label={`Обновлять фид ${row.name}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <IconAction
                              label="Проверить ссылку"
                              onClick={() => probeMutation.mutate(row.id)}
                              disabled={probingId === row.id}
                              icon={probingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                            />
                            <IconAction
                              label="Обновить сейчас"
                              onClick={() => syncNowMutation.mutate(row)}
                              disabled={!row.isEnabled || isSyncPending(row) || syncNowMutation.isPending}
                              icon={<RefreshCw className="h-4 w-4" />}
                            />
                            <IconAction
                              label="История обновлений"
                              active={showHistory}
                              onClick={() => setHistoryId(showHistory ? null : row.id)}
                              icon={<History className="h-4 w-4" />}
                            />
                            <IconAction
                              label="Изменить"
                              active={editing}
                              onClick={() => setEditingId(editing ? null : row.id)}
                              icon={<Pencil className="h-4 w-4" />}
                            />
                            {canDelete ? (
                              <IconAction
                                label="Удалить фид"
                                danger
                                onClick={() => {
                                  if (window.confirm(`Удалить фид «${row.name}»? ЖК и квартиры на сайте останутся, но перестанут обновляться.`)) {
                                    deleteMutation.mutate(row.id);
                                  }
                                }}
                                icon={<Trash2 className="h-4 w-4" />}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {editing ? (
                        <tr className="bg-muted/30">
                          <td colSpan={8} className="px-3 pb-4 pt-1">
                            <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2 lg:grid-cols-5">
                              <label className="text-xs space-y-1">
                                <span className="text-muted-foreground">Название фида</span>
                                <Input value={d.name} onChange={(e) => patchRow(row.id, { name: e.target.value })} className="h-9" />
                              </label>
                              <label className="text-xs space-y-1">
                                <span className="text-muted-foreground">ЖК на сайте (точное название)</span>
                                <Input
                                  value={d.blockName ?? ''}
                                  placeholder={d.name}
                                  onChange={(e) => patchRow(row.id, { blockName: e.target.value })}
                                  className="h-9"
                                />
                              </label>
                              <label className="text-xs space-y-1">
                                <span className="text-muted-foreground">Город</span>
                                <select
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                  value={d.regionId}
                                  onChange={(e) => patchRow(row.id, { regionId: Number(e.target.value) })}
                                >
                                  {regions.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs space-y-1">
                                <span className="text-muted-foreground">Планировки</span>
                                <select
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                  value={d.mediaMode}
                                  onChange={(e) => patchRow(row.id, { mediaMode: e.target.value as FeedLinkRow['mediaMode'] })}
                                >
                                  {(Object.keys(MEDIA_LABEL) as FeedLinkRow['mediaMode'][]).map((m) => (
                                    <option key={m} value={m}>
                                      {MEDIA_LABEL[m]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs space-y-1 md:col-span-2 lg:col-span-5">
                                <span className="text-muted-foreground">Ссылка на фид</span>
                                <Input
                                  value={d.feedUrl}
                                  onChange={(e) => patchRow(row.id, { feedUrl: e.target.value })}
                                  className="h-9 font-mono text-xs"
                                />
                              </label>
                              <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-5">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => saveMutation.mutate()}
                                  disabled={!hasDraft || saveMutation.isPending}
                                >
                                  {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                                  Сохранить
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[row.id];
                                      return next;
                                    });
                                    setEditingId(null);
                                  }}
                                >
                                  Отмена
                                </Button>
                                <span className="self-center text-xs text-muted-foreground">
                                  После сохранения фид обновится в течение нескольких минут.
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {showHistory ? (
                        <tr className="bg-muted/30">
                          <td colSpan={8} className="px-3 pb-4 pt-1">
                            <FeedHistory id={row.id} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="add-feed" className="scroll-mt-20 rounded-xl border p-4 space-y-3 bg-muted/20">
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
            <span className="text-muted-foreground">URL фида (Profitbase XML, JCAT, ЦИАН или ДомКлик)</span>
            <Input
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="https://pb....profitbase.ru/export/profitbase_xml/..."
              className="font-mono text-xs"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">Планировки</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={newMediaMode}
              onChange={(e) => setNewMediaMode(e.target.value as FeedLinkRow['mediaMode'])}
            >
              {(Object.keys(MEDIA_LABEL) as FeedLinkRow['mediaMode'][]).map((m) => (
                <option key={m} value={m}>
                  {MEDIA_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
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
