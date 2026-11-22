import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiGet, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

const ACTION_LABEL: Record<string, string> = { CREATE: 'Создание', UPDATE: 'Изменение', DELETE: 'Удаление' };

/** Подписи сущностей журнала по-русски; незнакомые показываются как есть */
const ENTITY_LABEL: Record<string, string> = {
  listing: 'Квартира / объект',
  block: 'ЖК',
  building: 'Корпус',
  builder: 'Застройщик',
  request: 'Заявка',
  news: 'Новость',
  user: 'Пользователь',
  feed_link: 'Фид',
  feed_sync: 'Обновление фида',
  site_setting: 'Настройка сайта',
  setting: 'Настройка сайта',
  banner: 'Баннер',
  expert: 'Эксперт',
  region: 'Регион',
  media: 'Файл',
};

type AuditItem = {
  id: string;
  userId: string | null;
  entityType: string;
  entityId: number;
  action: AuditAction;
  oldData: unknown | null;
  newData: unknown | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string | null } | null;
};

type AuditResponse = {
  items: AuditItem[];
  total: number;
  page: number;
  perPage: number;
};

function pretty(value: unknown): string {
  if (value == null) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminAudit() {
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState<string>('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('per_page', '20');
    if (entityType.trim()) p.set('entity_type', entityType.trim());
    if (userId.trim()) p.set('user_id', userId.trim());
    if (action) p.set('action', action);
    return p.toString();
  }, [action, entityType, page, userId]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin', 'audit', query],
    queryFn: () => apiGet<AuditResponse>(`/admin/audit?${query}`),
    keepPreviousData: true,
    staleTime: 10_000,
  });

  const maxPage = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 20)));

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Журнал действий</h1>
        {isFetching && !isLoading ? (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Обновление...
          </span>
        ) : null}
      </div>

      <div className="rounded-xl border p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
        <select
          aria-label="Что изменено"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Все разделы</option>
          {Object.entries(ENTITY_LABEL)
            .filter(([k], i, arr) => arr.findIndex(([, v]) => v === ENTITY_LABEL[k]) === i)
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <Input
          placeholder="ID пользователя"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setPage(1);
          }}
          className="h-9"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Все действия</option>
          <option value="CREATE">Создание</option>
          <option value="UPDATE">Изменение</option>
          <option value="DELETE">Удаление</option>
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEntityType('');
            setUserId('');
            setAction('');
            setPage(1);
          }}
          className="h-9"
        >
          Сбросить фильтры
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError && error.status === 403
            ? 'Недостаточно прав: журнал действий доступен только администратору.'
            : `Ошибка загрузки журнала: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`}
        </div>
      ) : null}

      {data ? (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Дата</th>
                  <th className="px-3 py-2 text-left font-medium">Пользователь</th>
                  <th className="px-3 py-2 text-left font-medium">Что изменено</th>
                  <th className="px-3 py-2 text-left font-medium">Действие</th>
                  <th className="px-3 py-2 text-left font-medium">IP</th>
                  <th className="px-3 py-2 text-right font-medium">Детали</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const expanded = openId === row.id;
                  return (
                    <FragmentRow
                      key={row.id}
                      row={row}
                      expanded={expanded}
                      onToggle={() => setOpenId(expanded ? null : row.id)}
                    />
                  );
                })}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>
                      Записей не найдено
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
            <span>Всего: {data.total}</span>
            <div className="inline-flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span>
                Страница {page} / {maxPage}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= maxPage}
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FragmentRow({
  row,
  expanded,
  onToggle,
}: {
  row: AuditItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const badge =
    row.action === 'CREATE'
      ? 'bg-emerald-100 text-emerald-800'
      : row.action === 'UPDATE'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-red-100 text-red-800';

  return (
    <>
      <tr className="border-t align-top">
        <td className="px-3 py-2 whitespace-nowrap">
          {new Date(row.createdAt).toLocaleString('ru-RU')}
        </td>
        <td className="px-3 py-2">
          <div className="font-medium">{row.user?.fullName || '—'}</div>
          <div className="text-xs text-muted-foreground">{row.user?.email || row.userId || '—'}</div>
        </td>
        <td className="px-3 py-2">
          {ENTITY_LABEL[row.entityType] ?? row.entityType} #{row.entityId}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${badge}`}>
            {ACTION_LABEL[row.action] ?? row.action}
          </span>
        </td>
        <td className="px-3 py-2">{row.ipAddress || '—'}</td>
        <td className="px-3 py-2 text-right">
          <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
            {expanded ? 'Скрыть' : 'Показать'}
          </Button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t bg-muted/30">
          <td className="px-3 py-3" colSpan={6}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <div className="rounded-lg border bg-background p-2">
                <p className="text-xs font-medium mb-1">old_data</p>
                <pre className="text-[11px] whitespace-pre-wrap break-all overflow-auto max-h-64">
                  {pretty(row.oldData)}
                </pre>
              </div>
              <div className="rounded-lg border bg-background p-2">
                <p className="text-xs font-medium mb-1">new_data</p>
                <pre className="text-[11px] whitespace-pre-wrap break-all overflow-auto max-h-64">
                  {pretty(row.newData)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
