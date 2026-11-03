import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Play, RefreshCw, CheckCircle2, XCircle, Clock, FileJson, Square, Trash2, AlertTriangle, Activity } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/shared/hooks/useAuth';
import AdminLoadingState from '@/admin/components/AdminLoadingState';
import AdminStatusBadge from '@/admin/components/AdminStatusBadge';
import CrmInlineError from '@/admin/components/CrmInlineError';

/** Пока источники не загружены — один и тот же пустой массив, а не новый на каждый рендер */
const NO_SOURCES: FeedSourceRow[] = [];

interface ImportHistoryRow {
  id: number;
  regionCode?: string | null;
  region?: {
    code?: string | null;
    name?: string | null;
  } | null;
  status: string;
  startedAt: string | null;
  createdAt?: string | null;
  finishedAt: string | null;
  blocksCreated?: number | null;
  blocksUpdated?: number | null;
  buildingsCreated?: number | null;
  buildingsUpdated?: number | null;
  listingsCreated?: number | null;
  listingsUpdated?: number | null;
  stats?: {
    blocks_upserted?: number;
    buildings_upserted?: number;
    apartments_upserted?: number;
    hasWarnings?: boolean;
    errors?: string[];
  } | null;
  errorMessage: string | null;
}

interface Progress {
  step: string;
  percent: number;
  detail?: string;
  processedItems?: number;
  totalItems?: number;
}

interface RegionOption {
  id: number;
  code: string;
  name: string;
}

interface FeedSourceRow {
  id: number;
  code: string;
  name: string;
  enabled: boolean;
  baseUrl: string | null;
  canImport: boolean;
  reason: string | null;
  files: { name: string; required: boolean; url: string | null }[];
}

interface FeedHealthSummary {
  ok: boolean;
  generatedAt: string;
  staleThresholdHours: number;
  regions: {
    enabled: number;
    stale: { code: string; name: string; lastImportedAt: string | null }[];
      health?: {
      code: string;
      name: string;
      lastImportedAt: string | null;
      catalogApartments: number;
      catalogBlocks: number;
      isStale: boolean;
      importAllowed: boolean;
      parityPercent?: { apartments: number | null; blocks: number | null };
    }[];
  };
  batches: {
    running: number;
    stuck: { id: number; regionCode: string; startedAt: string | null }[];
    failedLast24h: number;
    incompleteLast24h: number;
  };
  dataIntegrity: { orphanApartments: number; duplicateExternalIdGroups: unknown[] };
  queue: { waiting: number; active: number; delayed: number; failed: number } | null;
  issues: { kind: string; severity: string; messageRu: string }[];
  integrityScore?: number | null;
  governance?: {
    cronPattern: string;
    cronTz: string;
    cronDisabled: boolean;
    weeklyOnlyPolicy: boolean;
    overlapProtection: boolean;
    degradedQuarantine: boolean;
    markSoldMinRatio: number;
    integrityMinScore: number;
    degradedImportsLast7d: number;
  };
}

interface PublicDataQualityAudit {
  catalogEligible: number;
  orphanApartments: number;
  orphanBlocks: number;
  duplicateExternalIds: number;
  duplicateBlockSlugs: number;
  invalidCoordinates: number;
  apartmentsWithoutPlan: number;
  withoutGeo: number;
  blocksWithoutImages: number;
  parityPercent: { apartments: number | null; blocks: number | null };
  parityTargets: { donorApartments: number; donorBlocks: number };
}

interface SitemapMetrics {
  indexUrl: string;
  totalUrls: number | null;
  lastGeneration: { generatedAt: string; durationMs: number; counts: { total: number; apartments: number; complexes: number; listings: number } } | null;
}

interface FeedIntegrityReport {
  integrity_score: number;
  integrity_percent: { apartments: number | null; blocks: number | null };
  feed: {
    apartments_in_feed: number | null;
    blocks_in_feed: number | null;
    apartments_count_source: string;
  };
  database: {
    active_published: number;
    sold: number;
    orphan_apartments: number;
    catalog_eligible: number;
    blocks_with_active_listings: number;
  };
  vitrine_catalog_counts: { blocks: number; apartments: number };
  comparison: {
    apartments_feed_vs_active_db: { feed_expected: number | null; db_active_published: number; delta: number | null };
    blocks_feed_vs_vitrine: { feed: number | null; vitrine: number; delta: number | null };
  };
  last_completed_import: { apartments_in_feed?: number | null; apartments_upserted?: number | null } | null;
  explanations: string[];
}

interface FeedIncidentStatus {
  recoveryMode: boolean;
  degradedImportDetected: boolean;
  soldSpikeAlert: boolean;
  integrityScore: number | null;
  counts: { activePublished: number; sold: number; feedApartmentsInLastImport: number | null };
  recoveryRecommended: boolean;
  lastHealthyImport: { batchId: number; finishedAt: string | null; apartmentsInFeed: unknown } | null;
}

interface SoldRecoveryPlan {
  dryRun: boolean;
  falseSoldCandidates: number;
  legitimateSold: number;
  feedApartmentCount: number;
  safeToRestore: boolean;
  warnings: string[];
  restored?: number;
}

function batchHasWarnings(row: ImportHistoryRow): boolean {
  const stats = row.stats;
  if (stats?.hasWarnings) return true;
  return Array.isArray(stats?.errors) && stats.errors.length > 0;
}

function batchWarningCount(row: ImportHistoryRow): number {
  const stats = row.stats;
  if (Array.isArray(stats?.errors)) return stats.errors.length;
  return stats?.hasWarnings ? 1 : 0;
}

const statusIcon: Record<string, typeof CheckCircle2> = {
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  IN_PROGRESS: Loader2,
  RUNNING: Loader2,
  PENDING: Clock,
};

const statusLabel: Record<string, string> = {
  COMPLETED: 'Завершён',
  FAILED: 'Ошибка',
  IN_PROGRESS: 'В процессе',
  RUNNING: 'В процессе',
  PENDING: 'Ожидает',
};

const statusColor: Record<string, string> = {
  COMPLETED: 'text-green-600',
  FAILED: 'text-destructive',
  IN_PROGRESS: 'text-amber-600',
  RUNNING: 'text-amber-600',
  PENDING: 'text-muted-foreground',
};

const progressStepLabel: Record<string, string> = {
  'Downloading about.json': 'Загрузка описания фида',
  'Processing rooms': 'Обработка комнатности',
  'Processing finishings': 'Обработка отделки',
  'Processing buildingtypes': 'Обработка типов домов',
  'Processing regions': 'Обработка районов',
  'Processing subways': 'Обработка метро',
  'Processing builders': 'Обработка застройщиков',
  'Processing blocks': 'Обработка ЖК',
  'Processing buildings': 'Обработка корпусов',
  'Downloading apartments': 'Загрузка квартир',
  'Processing apartments': 'Обработка квартир',
  'Deriving block statuses': 'Расчёт статусов ЖК',
  Finalizing: 'Завершение импорта',
  Completed: 'Импорт завершён',
  Failed: 'Импорт остановлен или завершился ошибкой',
};

function historyRegionCode(row: ImportHistoryRow): string {
  return (row.regionCode ?? row.region?.code ?? '—').toString();
}

function historyStartedAt(row: ImportHistoryRow): string | null {
  return row.startedAt ?? row.createdAt ?? null;
}

function formatDateTime(value: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', options);
}

function statValue(row: ImportHistoryRow, direct: 'blocksCreated' | 'blocksUpdated' | 'buildingsCreated' | 'buildingsUpdated' | 'listingsCreated' | 'listingsUpdated'): number {
  const directValue = row[direct];
  if (typeof directValue === 'number') return directValue;
  if (direct === 'blocksUpdated') return row.stats?.blocks_upserted ?? 0;
  if (direct === 'buildingsUpdated') return row.stats?.buildings_upserted ?? 0;
  if (direct === 'listingsUpdated') return row.stats?.apartments_upserted ?? 0;
  return 0;
}

function progressLabel(progress: Progress): string {
  return progressStepLabel[progress.step] ?? progress.step;
}

function progressDetail(progress: Progress): string | undefined {
  if (typeof progress.processedItems === 'number' && typeof progress.totalItems === 'number') {
    return `${progress.processedItems.toLocaleString('ru-RU')} из ${progress.totalItems.toLocaleString('ru-RU')} объектов обработано`;
  }
  return progress.detail;
}

export default function AdminFeedImport() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [region, setRegion] = useState('all');
  const [selectedFeedCodes, setSelectedFeedCodes] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [integrityHeavy, setIntegrityHeavy] = useState(false);
  const canTrigger = user?.role === 'admin';

  const { data: regions = [] } = useQuery({
    queryKey: ['regions'],
    queryFn: () => apiGet<RegionOption[]>('/regions'),
    staleTime: 60_000,
  });

  const { data: sources = NO_SOURCES } = useQuery({
    queryKey: ['admin', 'feed-import', 'sources'],
    queryFn: () => apiGet<FeedSourceRow[]>('/admin/feed-import/sources'),
    staleTime: 30_000,
  });

  const importableSourceCodes = useMemo(
    () => sources.filter((s) => s.canImport).map((s) => s.code),
    [sources],
  );

  useEffect(() => {
    setSelectedFeedCodes((prev) => {
      const allowed = new Set(importableSourceCodes);
      const filtered = prev.filter((code) => allowed.has(code));
      const next = filtered.length ? filtered : importableSourceCodes;
      // Тот же набор — прежний массив, иначе эффект перерисовывает страницу по кругу
      return next.length === prev.length && next.every((c, i) => c === prev[i]) ? prev : next;
    });
  }, [importableSourceCodes]);

  const selectedRegionCode = useMemo(() => {
    if (region === 'all') return null;
    const selected = regions.find((r) => r.code === region);
    if (!selected) return null;
    return selected.code.toLowerCase();
  }, [region, regions]);

  const { data: progress, isFetching: progressFetching } = useQuery({
    queryKey: ['admin', 'feed-import', 'progress'],
    queryFn: () => apiGet<Progress>('/admin/feed-import/progress'),
    refetchInterval: (query) => {
      const step = query.state.data?.step;
      if (!step || ['idle', 'Failed', 'Completed'].includes(step)) return false;
      const pct = query.state.data?.percent ?? 0;
      if (pct >= 100) return false;
      return 3000;
    },
    staleTime: 2000,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['admin', 'feed-import', 'history'],
    queryFn: () => apiGet<{ data: ImportHistoryRow[] }>('/admin/feed-import/history?per_page=20'),
    staleTime: 10_000,
  });

  const { data: feedHealth, isFetching: healthFetching, refetch: refetchHealth } = useQuery({
    queryKey: ['admin', 'feed-import', 'health'],
    queryFn: () => apiGet<FeedHealthSummary>('/admin/feed-import/health'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const integrityRegion = selectedRegionCode ?? 'msk';

  const { data: incident } = useQuery({
    queryKey: ['admin', 'feed-import', 'incident', integrityRegion],
    queryFn: () => apiGet<FeedIncidentStatus>(`/admin/feed-import/recovery/incident?region=${encodeURIComponent(integrityRegion)}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: snapshots } = useQuery({
    queryKey: ['admin', 'feed-import', 'snapshots', integrityRegion],
    queryFn: () => apiGet<{ points: { finishedAt: string | null; apartmentsInFeed: number | null; degraded: boolean }[] }>(
      `/admin/feed-import/snapshots?region=${encodeURIComponent(integrityRegion)}&limit=8`,
    ),
    staleTime: 60_000,
  });

  const soldPlanMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      apiPost<SoldRecoveryPlan>(
        `/admin/feed-import/recovery/sold-restore?region=${encodeURIComponent(integrityRegion)}${dryRun ? '&dry_run=1' : ''}`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feed-import'] });
    },
  });

  const { data: integrity, isFetching: integrityLoading, refetch: refetchIntegrity } = useQuery({
    queryKey: ['admin', 'feed-import', 'integrity', integrityRegion, integrityHeavy],
    queryFn: () =>
      apiGet<FeedIntegrityReport>(
        `/admin/feed-import/integrity?region=${encodeURIComponent(integrityRegion)}${integrityHeavy ? '&include_apartments=1' : ''}`,
      ),
    staleTime: 60_000,
  });

  const { data: dataQuality } = useQuery({
    queryKey: ['admin', 'feed-import', 'data-quality', integrityRegion],
    queryFn: () =>
      apiGet<PublicDataQualityAudit>(
        `/admin/feed-import/recovery/data-quality?region=${encodeURIComponent(integrityRegion)}`,
      ),
    staleTime: 60_000,
  });

  const { data: sitemapMetrics } = useQuery({
    queryKey: ['admin', 'sitemap', 'metrics'],
    queryFn: () => apiGet<SitemapMetrics>('/admin/sitemap/metrics'),
    staleTime: 30_000,
  });

  const sitemapGenerateMutation = useMutation({
    mutationFn: () => apiPost<SitemapMetrics['lastGeneration']>('/admin/sitemap/generate', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'sitemap'] });
    },
  });

  const { data: diagnostics, isFetching: diagLoading, refetch: refetchDiag } = useQuery({
    queryKey: ['admin', 'feed-import', 'diagnostics', selectedRegionCode],
    queryFn: () =>
      apiGet<unknown>(
        `/admin/feed-import/diagnostics?region=${encodeURIComponent(selectedRegionCode ?? 'msk')}`,
      ),
    enabled: showDiagnostics && selectedRegionCode != null,
    staleTime: 30_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      apiPost('/admin/feed-import/trigger-selected', { regions: selectedFeedCodes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feed-import'] });
    },
  });

  const stopAllMutation = useMutation({
    mutationFn: () => apiPost('/admin/feed-import/stop', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feed-import'] });
    },
  });

  const stopBatchMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/admin/feed-import/history/${id}/stop`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feed-import'] });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/feed-import/history/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feed-import'] });
    },
  });

  const refreshCacheMutation = useMutation({
    mutationFn: () => apiPost('/admin/feed-import/refresh-cache', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feed-import'] });
    },
  });

  const isRunning =
    progress?.step !== undefined &&
    !['idle', 'Failed', 'Completed'].includes(progress.step) &&
    progress.percent < 100;
  const rows = history?.data ?? [];
  const latest = rows[0];
  const selectedCount = selectedFeedCodes.length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Download className="w-6 h-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Импорт фидов</h1>
            {feedHealth ? (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <AdminStatusBadge tone={feedHealth.ok ? 'ok' : 'warn'}>
                  {feedHealth.ok ? 'healthy' : 'attention'}
                </AdminStatusBadge>
                {feedHealth.governance?.weeklyOnlyPolicy ? (
                  <AdminStatusBadge tone="neutral">weekly cron</AdminStatusBadge>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setShowDiagnostics(false);
            }}
            className="h-10 rounded-xl border bg-background px-3 text-sm"
          >
            <option value="all">Все включённые регионы</option>
            {regions.map((r) => (
              <option key={r.id} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (selectedRegionCode == null) return;
              setShowDiagnostics(true);
              void refetchDiag();
            }}
            disabled={selectedRegionCode == null}
            className="inline-flex items-center gap-2 border bg-background px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
          >
            {diagLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            Отчёт фид vs БД
          </button>
          <button
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || isRunning || !canTrigger || selectedCount === 0}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            title={!canTrigger ? 'Запуск импорта доступен только администратору' : selectedCount === 0 ? 'Выберите хотя бы один доступный фид' : undefined}
          >
            {triggerMutation.isPending || isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Импорт идёт…' : `Запустить (${selectedCount})`}
          </button>
          <button
            onClick={() => stopAllMutation.mutate()}
            disabled={stopAllMutation.isPending || !isRunning || !canTrigger}
            className="inline-flex items-center gap-2 border border-destructive/40 bg-background px-4 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            title={!canTrigger ? 'Остановка доступна только администратору' : undefined}
          >
            {stopAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Остановить
          </button>
          <button
            onClick={() => refreshCacheMutation.mutate()}
            disabled={refreshCacheMutation.isPending || !canTrigger}
            className="inline-flex items-center gap-2 border bg-background px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            title={!canTrigger ? 'Обновление кеша доступно только администратору' : undefined}
          >
            {refreshCacheMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Обновить кеш каталога
          </button>
        </div>
      </div>

      {incident?.recoveryRecommended || incident?.soldSpikeAlert ? (
        <div className="mb-6 rounded-2xl border border-destructive/50 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-sm text-destructive">Production feed incident</h2>
              <p className="text-xs text-muted-foreground mt-1">
                ACTIVE {incident.counts.activePublished.toLocaleString('ru-RU')} · SOLD {incident.counts.sold.toLocaleString('ru-RU')}
                {incident.integrityScore != null ? ` · integrity ${incident.integrityScore}%` : ''}
              </p>
              {incident.degradedImportDetected ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Degraded import detected in recent history</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={soldPlanMutation.isPending}
              onClick={() => soldPlanMutation.mutate(true)}
              className="text-xs h-9 px-3 rounded-lg border bg-background hover:bg-muted"
            >
              {soldPlanMutation.isPending ? '…' : 'Preview SOLD recovery'}
            </button>
            {canTrigger ? (
              <button
                type="button"
                disabled={soldPlanMutation.isPending}
                onClick={() => {
                  if (!window.confirm('Restore false SOLD from current feed snapshot? Requires ~67k feed.')) return;
                  soldPlanMutation.mutate(false);
                }}
                className="text-xs h-9 px-3 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Execute recovery
              </button>
            ) : null}
          </div>
          {soldPlanMutation.data ? (
            <pre className="text-[10px] bg-muted/50 rounded-lg p-2 overflow-x-auto max-h-40">
              {JSON.stringify(soldPlanMutation.data, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      {dataQuality ? (
        <div className="mb-6 rounded-2xl border bg-background p-4">
          <h2 className="font-semibold text-sm mb-2">Public catalog data quality</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Catalog eligible</p>
              <p className="font-semibold tabular-nums">{dataQuality.catalogEligible.toLocaleString('ru-RU')}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Donor parity (apt)</p>
              <p className="font-semibold">{dataQuality.parityPercent.apartments ?? '—'}%</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Donor parity (ЖК)</p>
              <p className="font-semibold">{dataQuality.parityPercent.blocks ?? '—'}%</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Orphans / dupes</p>
              <p className="font-semibold">{dataQuality.orphanApartments} / {dataQuality.duplicateExternalIds}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Empty ЖК</p>
              <p className="font-semibold">{dataQuality.orphanBlocks}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">No plan image</p>
              <p className="font-semibold">{dataQuality.apartmentsWithoutPlan}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Dup slugs / bad geo</p>
              <p className="font-semibold">{dataQuality.duplicateBlockSlugs} / {dataQuality.invalidCoordinates}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Blocks w/o images</p>
              <p className="font-semibold">{dataQuality.blocksWithoutImages}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Target ~{dataQuality.parityTargets.donorApartments.toLocaleString('ru-RU')} apt · ~{dataQuality.parityTargets.donorBlocks} ЖК · without geo: {dataQuality.withoutGeo} · blocks w/o images: {dataQuality.blocksWithoutImages}
          </p>
        </div>
      ) : null}

      <div className="mb-6 rounded-2xl border bg-background p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="font-semibold text-sm">SEO sitemap scale</h2>
            <p className="text-xs text-muted-foreground">
              {sitemapMetrics?.totalUrls != null
                ? `${sitemapMetrics.totalUrls.toLocaleString('ru-RU')} URLs indexed`
                : 'Not generated yet'}
              {sitemapMetrics?.lastGeneration
                ? ` · last ${new Date(sitemapMetrics.lastGeneration.generatedAt).toLocaleString('ru-RU')} (${sitemapMetrics.lastGeneration.durationMs}ms)`
                : ''}
            </p>
          </div>
          {canTrigger ? (
            <button
              type="button"
              disabled={sitemapGenerateMutation.isPending}
              onClick={() => sitemapGenerateMutation.mutate()}
              className="text-xs h-9 px-3 rounded-lg border hover:bg-muted"
            >
              {sitemapGenerateMutation.isPending ? 'Generating…' : 'Regenerate sitemaps'}
            </button>
          ) : null}
        </div>
        {sitemapMetrics?.indexUrl ? (
          <p className="text-[10px] text-muted-foreground break-all">Index: {sitemapMetrics.indexUrl}</p>
        ) : null}
        {sitemapMetrics?.lastGeneration?.counts ? (
          <p className="text-[10px] text-muted-foreground mt-1">
            apt {sitemapMetrics.lastGeneration.counts.apartments.toLocaleString('ru-RU')} · ЖК {sitemapMetrics.lastGeneration.counts.complexes.toLocaleString('ru-RU')} · listings {sitemapMetrics.lastGeneration.counts.listings.toLocaleString('ru-RU')}
          </p>
        ) : null}
      </div>

      {snapshots?.points?.length ? (
        <div className="mb-6 rounded-2xl border bg-background p-4">
          <h2 className="font-semibold text-sm mb-2">Import snapshot trend</h2>
          <div className="flex gap-1 items-end h-16">
            {snapshots.points.map((p, i) => {
              const h = p.apartmentsInFeed ? Math.min(100, (p.apartmentsInFeed / 70000) * 100) : 4;
              return (
                <div
                  key={`${p.finishedAt ?? i}`}
                  title={`${p.apartmentsInFeed ?? '?'} apt${p.degraded ? ' (degraded)' : ''}`}
                  className={`flex-1 rounded-t ${p.degraded ? 'bg-amber-500' : 'bg-primary/70'}`}
                  style={{ height: `${h}%`, minHeight: 4 }}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Bar height ∝ apartments_in_feed (last {snapshots.points.length} imports)</p>
        </div>
      ) : null}

      {feedHealth ? (
        <section className="bg-background border rounded-2xl p-4 mb-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${feedHealth.ok ? 'text-green-600' : 'text-amber-600'}`} />
              <div>
                <h2 className="font-semibold text-sm">Диагностика фидов</h2>
                <p className="text-xs text-muted-foreground">
                  Регионов: {feedHealth.regions.enabled} · running: {feedHealth.batches.running} · failed 24ч: {feedHealth.batches.failedLast24h}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refetchHealth()}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${healthFetching ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Устаревшие</p>
              <p className="font-semibold">{feedHealth.regions.stale.length}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Зависшие</p>
              <p className="font-semibold">{feedHealth.batches.stuck.length}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Сироты (без ЖК)</p>
              <p className="font-semibold">{feedHealth.dataIntegrity.orphanApartments}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Частичные 24ч</p>
              <p className="font-semibold">{feedHealth.batches.incompleteLast24h}</p>
            </div>
          </div>
          {feedHealth.regions.health?.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-2 font-medium">Регион</th>
                    <th className="p-2 font-medium">Квартир</th>
                    <th className="p-2 font-medium">ЖК</th>
                    <th className="p-2 font-medium">Parity</th>
                    <th className="p-2 font-medium">Импорт</th>
                    <th className="p-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {feedHealth.regions.health.map((r) => (
                    <tr key={r.code} className="border-b last:border-0">
                      <td className="p-2">{r.name} <span className="text-muted-foreground">({r.code})</span></td>
                      <td className="p-2 tabular-nums">{r.catalogApartments.toLocaleString('ru-RU')}</td>
                      <td className="p-2 tabular-nums">{r.catalogBlocks.toLocaleString('ru-RU')}</td>
                      <td className="p-2 tabular-nums text-muted-foreground">
                        {r.parityPercent?.apartments != null ? `${r.parityPercent.apartments}%` : '—'}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.lastImportedAt
                          ? new Date(r.lastImportedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="p-2">
                        {r.isStale ? (
                          <AdminStatusBadge tone="warn">устарел</AdminStatusBadge>
                        ) : r.importAllowed ? (
                          <AdminStatusBadge tone="ok">ok</AdminStatusBadge>
                        ) : (
                          <AdminStatusBadge tone="neutral">не в allowlist</AdminStatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {feedHealth.governance ? (
            <p className="text-[10px] text-muted-foreground">
              Cron {feedHealth.governance.cronDisabled ? 'disabled' : `${feedHealth.governance.cronPattern} (${feedHealth.governance.cronTz})`}
              · overlap guard · quarantine on degraded
              · degraded 7d: {feedHealth.governance.degradedImportsLast7d}
            </p>
          ) : null}
          {feedHealth.issues.length ? (
            <ul className="space-y-1">
              {feedHealth.issues.map((issue) => (
                <li
                  key={issue.kind}
                  className={`text-xs flex items-start gap-1.5 ${issue.severity === 'critical' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {issue.messageRu}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-green-700">Критических проблем не обнаружено</p>
          )}
          {feedHealth.queue ? (
            <p className="text-[10px] text-muted-foreground">
              BullMQ: wait {feedHealth.queue.waiting} · active {feedHealth.queue.active} · failed {feedHealth.queue.failed}
            </p>
          ) : null}
        </section>
      ) : null}

      {integrity ? (
        <section className="bg-background border rounded-2xl p-4 mb-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">Feed integrity · {selectedRegionCode?.toUpperCase() ?? 'MSK'}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Score {integrity.integrity_score}% · источник квартир: {integrity.feed.apartments_count_source}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={integrityHeavy}
                  onChange={(e) => setIntegrityHeavy(e.target.checked)}
                />
                Полный apartments.json
              </label>
              <button type="button" onClick={() => void refetchIntegrity()} className="text-xs text-primary hover:underline">
                {integrityLoading ? '…' : 'Обновить'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Фид квартир</p>
              <p className="font-semibold">{integrity.feed.apartments_in_feed?.toLocaleString('ru-RU') ?? '—'}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">DB ACTIVE</p>
              <p className="font-semibold">{integrity.database.active_published.toLocaleString('ru-RU')}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Витрина</p>
              <p className="font-semibold">{integrity.vitrine_catalog_counts.apartments.toLocaleString('ru-RU')}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">SOLD (feed)</p>
              <p className="font-semibold">{integrity.database.sold.toLocaleString('ru-RU')}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">ЖК фид / витрина</p>
              <p className="font-semibold">
                {integrity.feed.blocks_in_feed ?? '—'} / {integrity.vitrine_catalog_counts.blocks}
              </p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Δ квартир</p>
              <p className="font-semibold">
                {integrity.comparison.apartments_feed_vs_active_db.delta?.toLocaleString('ru-RU') ?? '—'}
              </p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Сироты</p>
              <p className="font-semibold">{integrity.database.orphan_apartments}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-muted-foreground">Посл. upsert</p>
              <p className="font-semibold">
                {integrity.last_completed_import?.apartments_upserted?.toLocaleString('ru-RU') ?? '—'}
              </p>
            </div>
          </div>
          {integrity.explanations.slice(0, 4).map((line) => (
            <p key={line.slice(0, 40)} className="text-xs text-muted-foreground">{line}</p>
          ))}
        </section>
      ) : null}

      <div className="bg-background border rounded-2xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">Доступные фиды по регионам</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Отмечайте только регионы, для которых реально настроен фид. Сейчас доступна Москва.
            </p>
          </div>
          <span className="text-xs rounded-full bg-muted px-2 py-1 text-muted-foreground">
            Выбрано: {selectedCount}
          </span>
        </div>
        <div className="space-y-2">
          {sources.map((source) => {
            const checked = selectedFeedCodes.includes(source.code);
            return (
              <label
                key={source.id}
                className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${source.canImport ? 'cursor-pointer hover:bg-muted/30' : 'opacity-60 bg-muted/20'}`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={!source.canImport}
                  onChange={(e) => {
                    setSelectedFeedCodes((prev) =>
                      e.target.checked
                        ? Array.from(new Set([...prev, source.code]))
                        : prev.filter((code) => code !== source.code),
                    );
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{source.name}</span>
                    <span className="text-xs uppercase text-muted-foreground">{source.code}</span>
                    {source.canImport ? (
                      <span className="text-xs text-green-700">фид настроен</span>
                    ) : (
                      <span className="text-xs text-destructive">{source.reason ?? 'недоступен'}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">
                    {source.baseUrl ?? 'URL фида не задан'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {source.files.map((file) => (
                      <span key={file.name} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {file.name}.json
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {showDiagnostics && (
        <div className="bg-muted/30 border rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">
              GET /admin/feed-import/diagnostics?region={selectedRegionCode}
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => refetchDiag()}
            >
              Обновить
            </button>
          </div>
          {diagLoading && !diagnostics ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <pre className="text-xs overflow-x-auto max-h-[480px] overflow-y-auto whitespace-pre-wrap break-words">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Progress bar */}
      {isRunning && progress && (
        <div className="bg-background border rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {progressLabel(progress)}
            </span>
            <span className="text-sm text-muted-foreground">{progress.percent}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{progressDetail(progress) ?? 'Импорт выполняется, обновление статуса каждые несколько секунд'}</span>
            <span className="inline-flex items-center gap-1 text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />
              процесс идёт
            </span>
          </div>
        </div>
      )}

      {latest ? (
        <div className="bg-background border rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Последний импорт</p>
            <p className="font-medium">
              {formatDateTime(historyStartedAt(latest), {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Регион / статус</p>
            <p className="font-medium">{historyRegionCode(latest).toUpperCase()} · {statusLabel[latest.status] ?? latest.status}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Лог ошибки</p>
            <p className={latest.errorMessage ? 'text-destructive font-medium' : 'text-muted-foreground'}>
              {latest.errorMessage ?? 'Ошибок нет'}
            </p>
          </div>
        </div>
      ) : null}

      {/* History */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">История импортов</h2>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'feed-import', 'history'] })}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${progressFetching ? 'animate-spin' : ''}`} /> Обновить
        </button>
      </div>

      {historyLoading ? <AdminLoadingState compact label="Загрузка истории…" /> : null}

      {!historyLoading && rows.length === 0 && (
        <div className="bg-background border rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Импортов пока не было
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-background border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Регион</th>
                  <th className="px-4 py-3 font-medium">Старт</th>
                  <th className="px-4 py-3 font-medium">Финиш</th>
                  <th className="px-4 py-3 font-medium text-right">ЖК</th>
                  <th className="px-4 py-3 font-medium text-right">Корпуса</th>
                  <th className="px-4 py-3 font-medium text-right">Квартиры</th>
                  <th className="px-4 py-3 font-medium">Ошибка</th>
                  <th className="px-4 py-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(r => {
                  const hasWarnings = r.status === 'COMPLETED' && batchHasWarnings(r);
                  const Icon = hasWarnings ? AlertTriangle : (statusIcon[r.status] ?? Clock);
                  const rowStatusColor = hasWarnings ? 'text-amber-600' : (statusColor[r.status] ?? '');
                  const rowStatusLabel = hasWarnings
                    ? `С предупрежд. (${batchWarningCount(r)})`
                    : (statusLabel[r.status] ?? r.status);
                  return (
                    <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${rowStatusColor}`}>
                          <Icon className={`w-3.5 h-3.5 ${r.status === 'IN_PROGRESS' || r.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                          {rowStatusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs uppercase">{historyRegionCode(r)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(historyStartedAt(r), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(r.finishedAt, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="text-green-600">+{statValue(r, 'blocksCreated')}</span> / <span className="text-amber-600">{statValue(r, 'blocksUpdated')}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="text-green-600">+{statValue(r, 'buildingsCreated')}</span> / <span className="text-amber-600">{statValue(r, 'buildingsUpdated')}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="text-green-600">+{statValue(r, 'listingsCreated')}</span> / <span className="text-amber-600">{statValue(r, 'listingsUpdated')}</span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[320px] whitespace-pre-wrap break-words" title={r.errorMessage ?? ''}>
                        {r.errorMessage ? (
                          <span className="text-destructive">{r.errorMessage}</span>
                        ) : hasWarnings ? (
                          <span className="text-amber-700">{batchWarningCount(r)} предупр. в stats.errors</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {r.status === 'RUNNING' || r.status === 'PENDING' ? (
                            <button
                              type="button"
                              onClick={() => stopBatchMutation.mutate(r.id)}
                              disabled={!canTrigger || stopBatchMutation.isPending}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              title="Остановить импорт"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Удалить запрос импорта #${r.id}?`)) deleteBatchMutation.mutate(r.id);
                            }}
                            disabled={!canTrigger || deleteBatchMutation.isPending || r.status === 'RUNNING'}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            title={r.status === 'RUNNING' ? 'Сначала остановите импорт' : 'Удалить запрос'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
