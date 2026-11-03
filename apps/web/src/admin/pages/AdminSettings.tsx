import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Loader2, CheckCircle2 } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';

type SettingRow = { id: number; key: string; value: string; groupName: string; label: string; fieldType: string };
type GroupedSettings = Record<string, SettingRow[]>;

export default function AdminSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'content', 'settings'],
    queryFn: () => apiGet<GroupedSettings>('/admin/content/settings'),
    staleTime: 60_000,
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const flat: Record<string, string> = {};
    for (const rows of Object.values(data)) {
      for (const r of rows) flat[r.key] = r.value;
    }
    setValues(flat);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(values).map(([key, value]) => ({ key, value }));
      return apiPut('/admin/content/settings', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'content', 'settings'] });
      qc.invalidateQueries({ queryKey: ['content', 'settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const groupNames: Record<string, string> = {
    general: 'Общие',
    company: 'Компания',
    contacts: 'Контакты',
    social: 'Социальные сети',
    seo: 'SEO',
    map: 'Карта',
    homepage: 'Главная страница',
    legal: 'Юридическая информация',
    integrations: 'Интеграции (Telegram, Yandex Maps)',
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Метро в Анапе нет и по ТЗ не выводится — шаблоны «у метро» в настройках не показываем
  const groups = data
    ? Object.entries(data)
        .map(([group, rows]) => [group, rows.filter((r) => !r.key.includes('subway'))] as const)
        .filter(([, rows]) => rows.length > 0)
    : [];

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Настройки сайта</h1>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          {saved ? 'Сохранено' : 'Сохранить'}
        </button>
      </div>

      {mutation.isError && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-xl p-4 mb-4">
          Ошибка сохранения: {mutation.error instanceof Error ? mutation.error.message : 'Неизвестная ошибка'}
        </div>
      )}

      {groups.length === 0 && (
        <div className="bg-background border rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Настройки не найдены. Добавьте записи в таблицу site_settings.
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([group, rows]) => (
          <div key={group} className="bg-background border rounded-2xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              {groupNames[group] ?? group}
            </h2>
            <div className="space-y-4">
              {rows.map((row) => (
                <div key={row.key}>
                  <label className="text-sm font-medium mb-1 block">{row.label}</label>
                  {row.fieldType === 'TEXTAREA' ? (
                    <textarea
                      value={values[row.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [row.key]: e.target.value }))}
                      className="border rounded-xl px-3 py-2 text-sm w-full bg-background min-h-[80px]"
                    />
                  ) : row.fieldType === 'BOOLEAN' ? (
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(values[row.key] ?? '') === 'true'}
                        onChange={e => setValues(v => ({ ...v, [row.key]: e.target.checked ? 'true' : 'false' }))}
                        className="rounded border-input"
                      />
                      <span className="text-muted-foreground">включено</span>
                    </label>
                  ) : row.fieldType === 'SECRET' ? (
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={values[row.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))}
                      placeholder="Вставьте токен"
                      className="border rounded-xl px-3 py-2 text-sm w-full bg-background font-mono"
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[row.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [row.key]: e.target.value }))}
                      className="border rounded-xl px-3 py-2 text-sm w-full bg-background"
                    />
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">{row.key}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
