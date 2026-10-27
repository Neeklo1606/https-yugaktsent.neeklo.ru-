import { useQuery } from '@tanstack/react-query';
import { useCMSStore } from '../store/cms-store';
import { useContentStore } from '../store/content-store';
import { FileText, Image, Users, Building2, Home, Layers, ClipboardList, HardHat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { crmApiGet } from '@/admin/lib/crm-api';
import { crmQueryOptions } from '@/admin/lib/crm-query-options';
import { CRM_QUERY_KEYS } from '@/admin/lib/crm-query-keys';
import { CRM_CACHE_DASHBOARD, CRM_CACHE_OPERATIONAL } from '@/admin/lib/crm-cache-policy';
import { useSmartPollInterval, useCrmPollMeta } from '@/admin/hooks/useSmartPollInterval';
import { useAuth } from '@/shared/hooks/useAuth';
import { adminAuthQueryOptions } from '@/shared/lib/admin-auth-query';
import DataQualityPanel from '@/admin/components/DataQualityPanel';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Bar, BarChart } from 'recharts';

type Counters = { blocks: number; apartments: number; builders: number; regions: number };
type RequestRow = { id: number; name: string | null; phone: string | null; status: string; createdAt: string };
type DashboardStats = {
  periodDays: number;
  trend: Array<{ date: string; created: number; completed: number; cancelled: number }>;
  statusTotals: { NEW: number; IN_PROGRESS: number; COMPLETED: number; CANCELLED: number };
  workload: Array<{ assigneeId: string | null; assigneeName: string; role: string | null; openRequests: number }>;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const canEditContent = user?.role === 'admin' || user?.role === 'editor';
  const { pages: cmsPages, media } = useCMSStore();
  const { pages: contentPages } = useContentStore();
  const pollInterval = useSmartPollInterval('workload');
  const { online } = useCrmPollMeta();

  const { data: counters } = useQuery({
    queryKey: CRM_QUERY_KEYS.stats.counters,
    queryFn: () => apiGet<Counters>('/stats/counters'),
    ...adminAuthQueryOptions({
      staleTime: CRM_CACHE_DASHBOARD.staleTime,
      gcTime: CRM_CACHE_DASHBOARD.gcTime,
    }),
  });

  const { data: recentRequests } = useQuery({
    queryKey: CRM_QUERY_KEYS.requests.recent,
    queryFn: () => apiGet<{ data: RequestRow[] }>('/admin/requests?per_page=5&page=1&sort=priority'),
    ...crmQueryOptions({
      ...CRM_CACHE_OPERATIONAL,
      refetchInterval: pollInterval === false ? false : pollInterval,
      enabled: online,
    }),
  });

  const { data: crmWorkload } = useQuery({
    queryKey: CRM_QUERY_KEYS.requests.workload,
    queryFn: () =>
      crmApiGet<{ totals: { open: number; overdue: number; stale: number } }>(
        '/admin/requests/workload',
        'requests_workload',
      ),
    ...crmQueryOptions({
      ...CRM_CACHE_OPERATIONAL,
      refetchInterval: pollInterval === false ? false : pollInterval,
      enabled: online,
    }),
  });

  const { data: dashboardStats } = useQuery({
    queryKey: CRM_QUERY_KEYS.stats.dashboard,
    queryFn: () => apiGet<DashboardStats>('/admin/stats/dashboard?days=14'),
    ...crmQueryOptions({ ...CRM_CACHE_DASHBOARD }),
  });

  const stats = [
    { label: 'ЖК в базе', value: counters?.blocks ?? '—', icon: Building2, color: 'bg-primary/10 text-primary' },
    { label: 'Квартиры', value: counters?.apartments ?? '—', icon: Home, color: 'bg-blue-500/10 text-blue-600' },
    { label: 'Застройщики', value: counters?.builders ?? '—', icon: HardHat, color: 'bg-green-500/10 text-green-600' },
    { label: 'Медиа', value: media.length, icon: Image, color: 'bg-amber-500/10 text-amber-600' },
  ];

  const statusLabels: Record<string, string> = {
    NEW: 'Новая',
    IN_PROGRESS: 'В работе',
    COMPLETED: 'Закрыта',
    CANCELLED: 'Отменена',
    new: 'Новая',
    in_progress: 'В работе',
    done: 'Закрыта',
    cancelled: 'Отменена',
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Обзор</h1>
          <p className="text-muted-foreground text-sm mt-1">Каталог, заявки и качество данных</p>
        </div>
        {canEditContent ? (
          <Link
            to="/admin/data-sources"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            Источники данных
          </Link>
        ) : null}
      </div>

      {/* Работает на публичных данных каталога — виден и там, где админ-API недоступен */}
      <DataQualityPanel variant="compact" className="mb-6" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-background border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-muted-foreground text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {crmWorkload ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Link to="/admin/requests" className="rounded-xl border bg-background p-4 hover:border-primary/40 transition-colors">
            <p className="text-xs text-muted-foreground">Открытых заявок</p>
            <p className="text-2xl font-bold">{crmWorkload.totals.open}</p>
          </Link>
          <Link to="/admin/requests?sla=overdue" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 hover:border-red-500/50 transition-colors">
            <p className="text-xs text-muted-foreground">Просрочено</p>
            <p className="text-2xl font-bold text-red-600">{crmWorkload.totals.overdue}</p>
          </Link>
          <Link to="/admin/requests?sla=stale" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 hover:border-amber-500/50 transition-colors">
            <p className="text-xs text-muted-foreground">Застой</p>
            <p className="text-2xl font-bold text-amber-700">{crmWorkload.totals.stale}</p>
          </Link>
        </div>
      ) : null}

      {dashboardStats ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
          <div className="bg-background border rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Динамика заявок ({dashboardStats.periodDays} дн.)</h2>
            <ChartContainer
              className="h-[240px] w-full"
              config={{
                created: { label: 'Создано', color: '#2563eb' },
                completed: { label: 'Закрыто', color: '#16a34a' },
                cancelled: { label: 'Отменено', color: '#9ca3af' },
              }}
            >
              <LineChart data={dashboardStats.trend}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="created" stroke="var(--color-created)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cancelled" stroke="var(--color-cancelled)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </div>
          <div className="bg-background border rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Нагрузка по исполнителям</h2>
            <ChartContainer
              className="h-[240px] w-full"
              config={{ openRequests: { label: 'Открытых', color: '#f59e0b' } }}
            >
              <BarChart data={dashboardStats.workload.slice(0, 8)}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="assigneeName" tickFormatter={(v) => String(v).slice(0, 10)} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="openRequests" fill="var(--color-openRequests)" radius={4} />
              </BarChart>
            </ChartContainer>
            <div className="grid grid-cols-2 gap-2 text-xs mt-3">
              <div className="rounded-lg border p-2">Новые: <b>{dashboardStats.statusTotals.NEW}</b></div>
              <div className="rounded-lg border p-2">В работе: <b>{dashboardStats.statusTotals.IN_PROGRESS}</b></div>
              <div className="rounded-lg border p-2">Закрыто: <b>{dashboardStats.statusTotals.COMPLETED}</b></div>
              <div className="rounded-lg border p-2">Отменено: <b>{dashboardStats.statusTotals.CANCELLED}</b></div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Recent requests */}
      {recentRequests?.data && recentRequests.data.length > 0 && (
        <div className="bg-background border rounded-2xl p-5 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" /> Последние заявки
          </h2>
          <div className="space-y-2">
            {recentRequests.data.map(r => (
              <Link
                key={r.id}
                to={`/admin/requests/${r.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{r.name || 'Без имени'}</span>
                  <span className="text-xs text-muted-foreground">{r.phone}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg ${
                  r.status === 'NEW' || r.status === 'new' ? 'bg-blue-100 text-blue-700' :
                  r.status === 'IN_PROGRESS' || r.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                  r.status === 'COMPLETED' || r.status === 'done' ? 'bg-green-100 text-green-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {statusLabels[r.status] ?? r.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Content pages */}
      {canEditContent ? (
        <div className="bg-background border rounded-2xl p-5 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Контентные страницы
          </h2>
          <div className="space-y-2">
            {contentPages.map(p => (
              <Link
                key={p.slug}
                to={`/admin/page-editor/${encodeURIComponent(p.slug)}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.slug}</span>
                  <span className="text-xs text-muted-foreground">• {p.sections.length} секций</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg ${
                  p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {p.status === 'published' ? 'Опубликовано' : 'Черновик'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* CMS pages */}
      {canEditContent && cmsPages.length > 0 && (
        <div className="bg-background border rounded-2xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" /> Конструктор страниц
          </h2>
          <div className="space-y-2">
            {cmsPages.slice(0, 5).map(p => (
              <Link
                key={p.id}
                to={`/admin/editor/${p.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.slug}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg ${
                  p.status === 'published' ? 'bg-green-100 text-green-700' :
                  p.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {p.status === 'published' ? 'Опубликовано' : p.status === 'draft' ? 'Черновик' : 'Архив'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
