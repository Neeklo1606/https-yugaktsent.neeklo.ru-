import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  User,
} from 'lucide-react';
import { ApiError, apiGet, apiPost, apiPut } from '@/lib/api';
import { cn } from '@/lib/utils';
import CrmInlineError from '@/admin/components/CrmInlineError';
import { CRM_QUERY_KEYS } from '@/admin/lib/crm-query-keys';
import { CRM_CACHE_DETAIL, CRM_CACHE_REFERENCE } from '@/admin/lib/crm-cache-policy';
import { crmInvalidate } from '@/admin/lib/crm-invalidation';
import { crmQueryOptions, crmErrorMessage } from '@/admin/lib/crm-query-options';
import {
  REQUEST_EVENT_LABEL,
  REQUEST_STATUS_CLASS,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  allowedNextStatuses,
  formatRequestDate,
  objectLabel,
  sourceLabel,
  telHrefFromPhone,
  type RequestStatusKey,
} from '@/admin/lib/request-crm';
import { SlaBadge } from '@/admin/components/CrmWorkloadStrip';
import {
  buildEnrichedTimeline,
  computeSlaClient,
  rowUrgencyClass,
  type SlaStateKey,
} from '@/admin/lib/request-sla';
import RequestCommunicationPanel from '@/admin/components/RequestCommunicationPanel';
import RequestAutomationPanel from '@/admin/components/RequestAutomationPanel';
import { crmObsDetailFetch, crmObsStatusUpdate, crmObsTimelineHints, crmObsTimelineRender } from '@/admin/lib/crm-observability';

type AssigneeRow = { id: string; role: string; fullName: string | null; email: string | null };

type RequestEvent = {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
  actor: AssigneeRow | null;
};

type RequestDetail = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  type: string;
  status: string;
  comment: string | null;
  sourceUrl: string | null;
  consentVersion?: string | null;
  consentAt?: string | null;
  utm?: Record<string, string> | null;
  blockId: number | null;
  listingId: number | null;
  telegramSent: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  assignedTo: string | null;
  assignedUser: AssigneeRow | null;
  slaState?: SlaStateKey;
  inactiveLabel?: string;
  inactiveMs?: number;
  block: { id: number; name: string; slug: string } | null;
  listing: { id: number; title: string | null; kind: string; status: string } | null;
  events: RequestEvent[];
  timelineHints?: Array<{ code: string; severity: 'green' | 'yellow' | 'red'; message: string }>;
  attribution?: {
    sourceType: string;
    label: string;
    conversionSurface: string;
    landingPath: string | null;
  } | null;
  attributionHints?: Array<{ code: string; severity: 'green' | 'yellow' | 'red'; message: string }>;
  lifecycleHints?: Array<{ code: string; severity: 'green' | 'yellow' | 'red'; message: string }>;
  qualityHints?: Array<{ code: string; severity: 'green' | 'yellow' | 'red'; message: string }>;
  riskHints?: Array<{ code: string; severity: 'green' | 'yellow' | 'red'; message: string }>;
};

function parseApiMessage(e: unknown): string {
  if (e instanceof ApiError) {
    try {
      const j = JSON.parse(e.message) as { message?: string | string[] };
      if (Array.isArray(j.message)) return j.message.join(', ');
      if (typeof j.message === 'string') return j.message;
    } catch {
      return e.message || String(e.status);
    }
  }
  return e instanceof Error ? e.message : 'Ошибка';
}

function eventDescription(ev: RequestEvent): string {
  if (ev.type === 'STATUS_CHANGED' && ev.fromStatus && ev.toStatus) {
    return `${REQUEST_STATUS_LABEL[ev.fromStatus as RequestStatusKey] ?? ev.fromStatus} → ${REQUEST_STATUS_LABEL[ev.toStatus as RequestStatusKey] ?? ev.toStatus}`;
  }
  if (ev.note) return ev.note;
  return REQUEST_EVENT_LABEL[ev.type] ?? ev.type;
}

export default function AdminRequestDetail() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [detailTab, setDetailTab] = useState<'overview' | 'communication'>('overview');

  const assigneesQuery = useQuery({
    queryKey: CRM_QUERY_KEYS.requests.assignees,
    queryFn: () => apiGet<AssigneeRow[]>('/admin/requests/assignees'),
    ...crmQueryOptions({ ...CRM_CACHE_REFERENCE }),
  });

  const detailQuery = useQuery({
    queryKey: CRM_QUERY_KEYS.requests.detail(id),
    queryFn: async () => {
      const t0 = performance.now();
      const data = await apiGet<RequestDetail>(`/admin/requests/${id}`);
      crmObsDetailFetch(performance.now() - t0);
      return data;
    },
    ...crmQueryOptions({
      ...CRM_CACHE_DETAIL,
      enabled: Number.isFinite(id) && id > 0,
    }),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { status?: string; assignedTo?: string | null }) => {
      const t0 = performance.now();
      const status = payload.status ?? detailQuery.data!.status;
      const res = await apiPut(`/admin/requests/${id}`, {
        status,
        ...(payload.assignedTo !== undefined ? { assignedTo: payload.assignedTo } : {}),
      });
      crmObsStatusUpdate(performance.now() - t0);
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CRM_QUERY_KEYS.requests.detail(id) });
      void crmInvalidate(qc, 'request_mutation');
    },
  });

  const noteMutation = useMutation({
    mutationFn: (text: string) => apiPost(`/admin/requests/${id}/notes`, { note: text }),
    onSuccess: () => {
      setNote('');
      void qc.invalidateQueries({ queryKey: CRM_QUERY_KEYS.requests.detail(id) });
      void crmInvalidate(qc, 'request_mutation');
    },
  });

  const data = detailQuery.data;
  const consentInfo = (data ?? {}) as Pick<RequestDetail, 'consentAt' | 'consentVersion' | 'utm'>;
  const nextStatuses = useMemo(
    () => (data ? allowedNextStatuses(data.status) : []),
    [data],
  );

  const tgState = useMemo(() => {
    if (!data) return null;
    const assignedViaTg = data.events.some(
      (e) => e.type === 'ASSIGNED' && e.note?.includes('Telegram'),
    );
    const claimEvent = [...data.events].reverse().find((e) => e.type === 'ASSIGNED');
    return {
      notified: data.telegramSent,
      claimed: Boolean(data.assignedTo),
      claimedBy: data.assignedUser?.fullName ?? data.assignedUser?.email ?? null,
      claimedViaTelegram: assignedViaTg,
      claimedAt: claimEvent?.createdAt ?? null,
    };
  }, [data]);

  const timelineItems = useMemo(() => {
    if (!data?.events) return [];
    const t0 = performance.now();
    const items = buildEnrichedTimeline(data.events);
    crmObsTimelineRender(performance.now() - t0);
    return items;
  }, [data?.events]);

  const timelineHints = useMemo(() => {
    if (!data?.timelineHints?.length) return [];
    const t0 = performance.now();
    const hints = data.timelineHints;
    crmObsTimelineHints(performance.now() - t0, hints.length);
    return hints;
  }, [data?.timelineHints]);

  const sla = useMemo(() => {
    if (!data) return null;
    if (data.slaState) {
      return {
        slaState: data.slaState,
        inactiveLabel: data.inactiveLabel ?? '',
      };
    }
    return computeSlaClient(data);
  }, [data]);

  if (!Number.isFinite(id) || id <= 0) {
    return <div className="p-6 text-sm text-muted-foreground">Неверный ID заявки</div>;
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detailQuery.isError || !data) {
    return (
      <div className="p-6 space-y-3 max-w-lg">
        <CrmInlineError
          message={crmErrorMessage(detailQuery.error, parseApiMessage(detailQuery.error))}
          onRetry={() => void detailQuery.refetch()}
        />
        <Link to="/admin/requests" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> К списку заявок
        </Link>
      </div>
    );
  }

  const phoneHref = data.phone ? telHrefFromPhone(data.phone) : '';

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/requests')}
          className="p-2 rounded-lg hover:bg-muted"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold truncate">Заявка #{data.id}</h1>
          <p className="text-sm text-muted-foreground">{formatRequestDate(data.createdAt)}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
            REQUEST_STATUS_CLASS[data.status as RequestStatusKey] ?? 'bg-muted',
          )}
        >
          {REQUEST_STATUS_LABEL[data.status as RequestStatusKey] ?? data.status}
        </span>
      </div>

      <div className="flex border-b text-sm">
        {(['overview', 'communication'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setDetailTab(tab)}
            className={cn(
              'px-4 py-2.5 font-medium min-h-[44px] touch-manipulation',
              detailTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground',
            )}
          >
            {tab === 'overview' ? 'Обзор' : 'Коммуникация'}
          </button>
        ))}
      </div>

      {detailTab === 'communication' ? (
        <RequestCommunicationPanel requestId={id} />
      ) : null}

      {detailTab === 'overview' ? (
      <>
      {sla && sla.slaState !== 'ARCHIVED' && sla.slaState !== 'ACTIVE' ? (
        <div
          className={cn(
            'rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2',
            rowUrgencyClass(sla.slaState),
          )}
        >
          <div className="flex items-center gap-2">
            <SlaBadge slaState={sla.slaState} inactiveLabel={sla.inactiveLabel} />
            <span className="text-xs text-muted-foreground">
              последняя активность {formatRequestDate(data.lastActivityAt)}
            </span>
          </div>
          {(sla.slaState === 'OVERDUE' || sla.slaState === 'STALE') ? (
            <span className="text-xs text-muted-foreground">Требует внимания менеджера</span>
          ) : null}
        </div>
      ) : null}

      {timelineHints.length > 0 ? (
        <section className="rounded-xl border bg-card p-3 space-y-2">
          <h2 className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
            Операционные сигналы
          </h2>
          <ul className="flex flex-wrap gap-2">
            {timelineHints.map((h) => (
              <li
                key={h.code}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium border',
                  h.severity === 'red' && 'border-red-500/40 bg-red-500/10 text-red-700',
                  h.severity === 'yellow' && 'border-amber-500/40 bg-amber-500/10 text-amber-800',
                  h.severity === 'green' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800',
                )}
              >
                {h.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RequestAutomationPanel requestId={id} />

      {data.attribution || (data.attributionHints && data.attributionHints.length > 0) ? (
        <section className="rounded-xl border bg-card p-3 space-y-2">
          <h2 className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
            Атрибуция
          </h2>
          {data.attribution ? (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Источник</dt>
                <dd className="font-medium">{data.attribution.label}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Поверхность</dt>
                <dd className="font-medium">{data.attribution.conversionSurface}</dd>
              </div>
              {data.attribution.landingPath ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Landing</dt>
                  <dd className="font-mono text-[11px] truncate">{data.attribution.landingPath}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {data.attributionHints && data.attributionHints.length > 0 ? (
            <ul className="flex flex-wrap gap-2 pt-1">
              {data.attributionHints.map((h) => (
                <li
                  key={h.code}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium border',
                    h.severity === 'red' && 'border-red-500/40 bg-red-500/10 text-red-700',
                    h.severity === 'yellow' && 'border-amber-500/40 bg-amber-500/10 text-amber-800',
                    h.severity === 'green' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800',
                  )}
                >
                  {h.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {data.lifecycleHints && data.lifecycleHints.length > 0 ? (
        <section className="rounded-xl border bg-card p-3 space-y-2">
          <h2 className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
            Lifecycle
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.lifecycleHints.map((h) => (
              <li
                key={h.code}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium border',
                  h.severity === 'red' && 'border-red-500/40 bg-red-500/10 text-red-700',
                  h.severity === 'yellow' && 'border-amber-500/40 bg-amber-500/10 text-amber-800',
                  h.severity === 'green' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800',
                )}
              >
                {h.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.qualityHints && data.qualityHints.length > 0 ? (
        <section className="rounded-xl border bg-card p-3 space-y-2">
          <h2 className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
            Outcome quality
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.qualityHints.map((h) => (
              <li
                key={h.code}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium border',
                  h.severity === 'red' && 'border-red-500/40 bg-red-500/10 text-red-700',
                  h.severity === 'yellow' && 'border-amber-500/40 bg-amber-500/10 text-amber-800',
                  h.severity === 'green' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800',
                )}
              >
                {h.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.riskHints && data.riskHints.length > 0 ? (
        <section className="rounded-xl border bg-card p-3 space-y-2">
          <h2 className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
            Operational risk
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.riskHints.map((h) => (
              <li
                key={h.code}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium border',
                  h.severity === 'red' && 'border-red-500/40 bg-red-500/10 text-red-700',
                  h.severity === 'yellow' && 'border-amber-500/40 bg-amber-500/10 text-amber-800',
                  h.severity === 'green' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800',
                )}
              >
                {h.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {phoneHref ? (
          <a
            href={phoneHref}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Phone className="w-4 h-4" />
            Позвонить
          </a>
        ) : null}
        {data.listingId ? (
          <Link to={`/listing/${data.listingId}`} target="_blank" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border text-sm">
            <ExternalLink className="w-4 h-4" />
            Объект
          </Link>
        ) : null}
        {data.block?.slug ? (
          <Link to={`/complex/${data.block.slug}`} target="_blank" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border text-sm">
            <ExternalLink className="w-4 h-4" />
            ЖК
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Клиент
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Имя</dt>
              <dd className="font-medium">{data.name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Телефон</dt>
              <dd className="font-medium">{data.phone || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Тип</dt>
              <dd>{REQUEST_TYPE_LABEL[data.type] ?? data.type}</dd>
            </div>
          </dl>
          {data.comment ? (
            <p className="text-sm text-muted-foreground border-t pt-3 whitespace-pre-wrap">{data.comment}</p>
          ) : null}
        </section>

        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Объект и источник</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Объект</dt>
              <dd className="font-medium text-right">{objectLabel(data)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Источник</dt>
              <dd className="text-right truncate max-w-[200px]" title={data.sourceUrl ?? ''}>
                {sourceLabel(data.sourceUrl)}
              </dd>
            </div>
            {consentInfo.utm && Object.keys(consentInfo.utm).length ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Метки</dt>
                <dd className="text-right break-all max-w-[220px] text-xs">
                  {Object.entries(consentInfo.utm).map(([k, v]) => `${k}=${v}`).join(' · ')}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Согласие на обработку ПД</dt>
              <dd className="text-right">
                {consentInfo.consentAt
                  ? `${new Date(consentInfo.consentAt).toLocaleString('ru-RU')} · ред. ${consentInfo.consentVersion ?? '—'}`
                  : 'не зафиксировано (заявка до 11.11.2026)'}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="font-semibold text-sm">Статус и назначение</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Менеджер</label>
            <select
              value={data.assignedTo ?? 'none'}
              disabled={updateMutation.isPending}
              onChange={(e) =>
                updateMutation.mutate({
                  assignedTo: e.target.value === 'none' ? null : e.target.value,
                })
              }
              className="w-full h-10 rounded-lg border px-3 text-sm bg-background"
            >
              <option value="none">Не назначен</option>
              {(assigneesQuery.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.fullName ?? a.email ?? a.id).trim()} ({a.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Статус</label>
            <select
              value={data.status}
              disabled={updateMutation.isPending}
              onChange={(e) => updateMutation.mutate({ status: e.target.value })}
              className="w-full h-10 rounded-lg border px-3 text-sm bg-background"
            >
              <option value={data.status}>
                {REQUEST_STATUS_LABEL[data.status as RequestStatusKey] ?? data.status} (текущий)
              </option>
              {nextStatuses.map((s) => (
                <option key={s} value={s}>
                  {REQUEST_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {updateMutation.isError ? (
          <p className="text-sm text-destructive">{parseApiMessage(updateMutation.error)}</p>
        ) : null}
      </section>

      {tgState ? (
        <section className="rounded-xl border bg-card p-4 space-y-2">
          <h2 className="font-semibold text-sm">Telegram</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Уведомление</dt>
              <dd className="font-medium">{tgState.notified ? 'Отправлено' : 'Нет'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Принята</dt>
              <dd className="font-medium">{tgState.claimed ? 'Да' : 'Нет'}</dd>
            </div>
            {tgState.claimedBy ? (
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">Исполнитель</dt>
                <dd className="font-medium">
                  {tgState.claimedBy}
                  {tgState.claimedAt ? ` · ${formatRequestDate(tgState.claimedAt)}` : ''}
                  {tgState.claimedViaTelegram ? ' · TG' : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Заметка
        </h2>
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Добавить заметку…"
            className="flex-1 rounded-lg border px-3 py-2 text-sm resize-none"
          />
          <button
            type="button"
            disabled={!note.trim() || noteMutation.isPending}
            onClick={() => noteMutation.mutate(note.trim())}
            className="shrink-0 h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-sm">История</h2>
        <ol className="space-y-3 border-l-2 border-border ml-2 pl-4">
          {timelineItems.map((item) =>
            item.kind === 'marker' ? (
              <li key={item.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{formatRequestDate(item.createdAt)}</p>
              </li>
            ) : (
              <li key={item.event.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium">{REQUEST_EVENT_LABEL[item.event.type] ?? item.event.type}</p>
                <p className="text-sm text-muted-foreground">{eventDescription(item.event)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatRequestDate(item.event.createdAt)}
                  {item.event.actor ? ` · ${item.event.actor.fullName ?? item.event.actor.email}` : ''}
                </p>
              </li>
            ),
          )}
        </ol>
      </section>
      </>
      ) : null}
    </div>
  );
}
