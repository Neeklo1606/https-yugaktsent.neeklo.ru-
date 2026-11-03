import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MessageCircle, UserMinus, X } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';

type AccessRequest = {
  id: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramUserId: string;
  telegramChatId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt: string | null;
};

type Recipient = {
  id: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramUserId: string;
  telegramChatId: string;
  isActive: boolean;
  approvedAt: string | null;
};

function displayName(row: {
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
}) {
  const full = [row.telegramFirstName, row.telegramLastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (row.telegramUsername) return `@${row.telegramUsername}`;
  return 'Без имени';
}

export default function AdminTelegramNotify() {
  const qc = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ['admin', 'telegram-notify', 'requests', 'pending'],
    queryFn: () => apiGet<AccessRequest[]>('/admin/telegram-notify/requests?status=PENDING'),
    refetchInterval: 20_000,
  });

  const recipientsQuery = useQuery({
    queryKey: ['admin', 'telegram-notify', 'recipients'],
    queryFn: () => apiGet<Recipient[]>('/admin/telegram-notify/recipients'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/admin/telegram-notify/requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'telegram-notify'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/admin/telegram-notify/requests/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'telegram-notify'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/telegram-notify/recipients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'telegram-notify'] });
    },
  });

  const isLoading = pendingQuery.isLoading || recipientsQuery.isLoading;
  const error =
    (pendingQuery.error instanceof Error && pendingQuery.error.message) ||
    (recipientsQuery.error instanceof Error && recipientsQuery.error.message) ||
    (approveMutation.error instanceof Error && approveMutation.error.message) ||
    (rejectMutation.error instanceof Error && rejectMutation.error.message) ||
    (deactivateMutation.error instanceof Error && deactivateMutation.error.message) ||
    '';

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-7 h-7 text-primary" />
          Telegram уведомления команды
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Пользователь пишет боту команду <code>/admin</code>, заявка появляется здесь, после одобрения пользователь
          добавляется в получатели уведомлений по заявкам. Это отдельный процесс и не влияет на привязку Telegram
          для входа в аккаунт.
        </p>
      </div>

      {error ? (
        <div className="bg-destructive/10 text-destructive text-sm rounded-xl p-4">
          Ошибка: {error}
        </div>
      ) : null}

      <section className="bg-background border rounded-2xl overflow-x-auto">
        <div className="px-5 py-4 border-b bg-muted/30">
          <h2 className="font-semibold">Заявки на доступ ({pendingQuery.data?.length ?? 0})</h2>
        </div>
        {pendingQuery.data?.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Пользователь</th>
                <th className="text-left p-3 font-medium">username</th>
                <th className="text-left p-3 font-medium">Telegram ID</th>
                <th className="text-left p-3 font-medium">Дата</th>
                <th className="text-right p-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {pendingQuery.data.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-3">{displayName(row)}</td>
                  <td className="p-3 font-mono text-xs">{row.telegramUsername ? `@${row.telegramUsername}` : '—'}</td>
                  <td className="p-3 font-mono text-xs">{row.telegramUserId}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString('ru-RU')}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => approveMutation.mutate(row.id)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50"
                      >
                        <Check className="w-4 h-4 text-emerald-600" />
                        Одобрить
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectMutation.mutate(row.id)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50"
                      >
                        <X className="w-4 h-4 text-destructive" />
                        Отклонить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Новых заявок нет.</div>
        )}
      </section>

      <section className="bg-background border rounded-2xl overflow-x-auto">
        <div className="px-5 py-4 border-b bg-muted/30">
          <h2 className="font-semibold">Получатели уведомлений ({recipientsQuery.data?.length ?? 0})</h2>
        </div>
        {recipientsQuery.data?.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Пользователь</th>
                <th className="text-left p-3 font-medium">Telegram ID</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="text-left p-3 font-medium">Одобрен</th>
                <th className="text-right p-3 font-medium">Действие</th>
              </tr>
            </thead>
            <tbody>
              {(recipientsQuery.data ?? []).map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-3">{displayName(row)}</td>
                  <td className="p-3 font-mono text-xs">{row.telegramUserId}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {row.isActive ? 'Активен' : 'Отключен'}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {row.approvedAt ? new Date(row.approvedAt).toLocaleString('ru-RU') : '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => deactivateMutation.mutate(row.id)}
                        disabled={!row.isActive || deactivateMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50"
                      >
                        <UserMinus className="w-4 h-4" />
                        Отключить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Список получателей пуст.</div>
        )}
      </section>
    </div>
  );
}
