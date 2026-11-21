import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BellRing,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  MapPinned,
  Send,
  Webhook,
  XCircle,
} from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { cn } from '@/lib/utils';

type SettingRow = { key: string; value: string };
type Status = {
  telegram: { tokenSet: boolean; recipients: number };
  maps: { keySet: boolean };
  metrika: { id: string | null };
  webmaster: { yandex: boolean; google: boolean };
  webhook: { set: boolean };
  feeds: { total: number; enabled: number; withErrors: number; lastSyncedAt: string | null };
};
type TestResult = { ok: boolean; error?: string; bot?: string; sent?: number; recipients?: number; status?: number };

type Field = { key: string; label: string; placeholder?: string; secret?: boolean; hint?: string; pattern?: RegExp; patternError?: string };

function StatusBadge({ ok, okText = 'Подключено', offText = 'Не настроено' }: { ok: boolean; okText?: string; offText?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium',
        ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-muted-foreground/50')} aria-hidden />
      {ok ? okText : offText}
    </span>
  );
}

function SecretInput({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder?: string; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-10 font-mono text-[13px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={show ? 'Скрыть' : 'Показать'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function IntegrationCard({
  icon,
  title,
  description,
  badge,
  fields,
  values,
  onChange,
  footer,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge: ReactNode;
  fields?: Field[];
  values: Record<string, string>;
  onChange: (key: string, v: string) => void;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
          <div>
            <h2 className="text-[16px] font-semibold leading-tight">{title}</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="shrink-0">{badge}</div>
      </div>
      {fields?.length ? (
        <div className="mt-4 space-y-3">
          {fields.map((f) => {
            const val = values[f.key] ?? '';
            const invalid = Boolean(val.trim() && f.pattern && !f.pattern.test(val.trim()));
            return (
              <div key={f.key}>
                <label htmlFor={`f-${f.key}`} className="mb-1 block text-[13px] font-medium">
                  {f.label}
                </label>
                {f.secret ? (
                  <SecretInput id={`f-${f.key}`} value={val} onChange={(v) => onChange(f.key, v)} placeholder={f.placeholder} />
                ) : (
                  <input
                    id={`f-${f.key}`}
                    value={val}
                    placeholder={f.placeholder}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    spellCheck={false}
                    className={cn(
                      'h-10 w-full rounded-lg border bg-background px-3 text-[14px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
                      invalid ? 'border-destructive' : 'border-input',
                    )}
                  />
                )}
                {invalid ? (
                  <p className="mt-1 text-[12px] text-destructive">{f.patternError}</p>
                ) : f.hint ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">{f.hint}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {children}
      {footer ? <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">{footer}</div> : null}
    </section>
  );
}

function TestButton({ path, label }: { path: string; label: string }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const m = useMutation({
    mutationFn: () => apiPost<TestResult>(path),
    onSuccess: setResult,
    onError: (e: unknown) => setResult({ ok: false, error: e instanceof Error ? e.message : 'Ошибка' }),
  });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setResult(null);
          m.mutate();
        }}
        disabled={m.isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[13px] font-medium transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
      >
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {label}
      </button>
      {result ? (
        <span className={cn('inline-flex min-w-0 items-center gap-1 text-[13px]', result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
          {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            {result.ok
              ? [result.bot, result.sent != null ? `отправлено ${result.sent} из ${result.recipients}` : null, result.status ? `ответ ${result.status}` : null]
                  .filter(Boolean)
                  .join(' · ') || 'Работает'
              : result.error || 'Не удалось'}
          </span>
        </span>
      ) : null}
    </div>
  );
}

const KEYS = [
  'telegram_bot_token',
  'lead_webhook_url',
  'yandex_metrika_id',
  'yandex_verification',
  'google_site_verification',
  'yandex_maps_api_key',
];

/**
 * «Интеграции»: все ключи и подключения в одном месте, со статусом и кнопкой «Проверить».
 * Хранится в site_settings (секреты — только у администратора, наружу не отдаются).
 */
export default function AdminIntegrations() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['admin', 'settings', 'raw'],
    queryFn: () => apiGet<Record<string, SettingRow[]>>('/admin/content/settings'),
  });
  const status = useQuery({
    queryKey: ['admin', 'integrations', 'status'],
    queryFn: () => apiGet<Status>('/admin/integrations/status'),
  });

  const initial = useMemo(() => {
    const flat: Record<string, string> = {};
    for (const rows of Object.values(settings.data ?? {})) for (const r of rows) if (KEYS.includes(r.key)) flat[r.key] = r.value ?? '';
    return flat;
  }, [settings.data]);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues(initial), [initial]);
  const dirty = KEYS.filter((k) => (values[k] ?? '') !== (initial[k] ?? ''));

  const save = useMutation({
    mutationFn: () => apiPut('/admin/content/settings', dirty.map((key) => ({ key, value: (values[key] ?? '').trim() }))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'integrations', 'status'] });
    },
  });

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const st = status.data;

  if (settings.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ключи и подключения</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Всё, что связывает сайт с внешними сервисами. Секретные ключи видит только администратор; после сохранения нажмите
          «Проверить», чтобы убедиться, что подключение работает.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntegrationCard
          icon={<BellRing className="h-5 w-5" />}
          title="Заявки в Telegram"
          description="Бот присылает менеджерам уведомление о каждой заявке. Без этого заявки видны только в разделе «Заявки»."
          badge={<StatusBadge ok={Boolean(st?.telegram.tokenSet && st.telegram.recipients > 0)} okText={`${st?.telegram.recipients ?? 0} получ.`} offText={st?.telegram.tokenSet ? 'Нет получателей' : 'Не настроено'} />}
          fields={[{ key: 'telegram_bot_token', label: 'Токен бота', secret: true, placeholder: '123456:ABC…', hint: 'Создайте бота у @BotFather и вставьте токен. Затем менеджеры пишут боту /admin.' }]}
          values={values}
          onChange={set}
          footer={
            <>
              <TestButton path="/admin/integrations/telegram/test" label="Проверить бота" />
              <Link to="/admin/telegram-notify" className="ml-auto text-[13px] font-medium text-primary hover:underline">
                Получатели →
              </Link>
            </>
          }
        />

        <IntegrationCard
          icon={<Webhook className="h-5 w-5" />}
          title="CRM (вебхук)"
          description="Каждая новая заявка уходит в CRM: amoCRM, Битрикс24 или через Make/Albato. Передаются имя, телефон, объект и ссылка."
          badge={<StatusBadge ok={Boolean(st?.webhook.set)} />}
          fields={[
            {
              key: 'lead_webhook_url',
              label: 'Адрес вебхука',
              secret: true,
              placeholder: 'https://…',
              pattern: /^https:\/\/\S+$/,
              patternError: 'Нужен адрес https://',
              hint: 'Только https и внешний адрес.',
            },
          ]}
          values={values}
          onChange={set}
          footer={<TestButton path="/admin/integrations/webhook/test" label="Отправить тестовую заявку" />}
        />

        <IntegrationCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Яндекс Метрика"
          description="Посещаемость и цели. Счётчик грузится после согласия посетителя на cookie и после загрузки страницы — не тормозит сайт."
          badge={<StatusBadge ok={Boolean(st?.metrika.id)} okText={`№ ${st?.metrika.id ?? ''}`} />}
          fields={[{ key: 'yandex_metrika_id', label: 'Номер счётчика', placeholder: '12345678', pattern: /^\d{5,12}$/, patternError: 'Только цифры, 5–12 знаков' }]}
          values={values}
          onChange={set}
        />

        <IntegrationCard
          icon={<Globe2 className="h-5 w-5" />}
          title="Вебмастер и Search Console"
          description="Подтверждение прав на сайт для Яндекс Вебмастера и Google Search Console. Код попадает в HTML всех страниц после ближайшего обновления (до 6 часов)."
          badge={<StatusBadge ok={Boolean(st?.webmaster.yandex || st?.webmaster.google)} okText={[st?.webmaster.yandex ? 'Яндекс' : '', st?.webmaster.google ? 'Google' : ''].filter(Boolean).join(' + ')} />}
          fields={[
            { key: 'yandex_verification', label: 'Яндекс: код', placeholder: 'из <meta name="yandex-verification" content="…">', pattern: /^[\w-]{6,80}$/, patternError: 'Только код из content="…"' },
            { key: 'google_site_verification', label: 'Google: код', placeholder: 'из <meta name="google-site-verification" content="…">', pattern: /^[\w-]{6,80}$/, patternError: 'Только код из content="…"' },
          ]}
          values={values}
          onChange={set}
        />

        <IntegrationCard
          icon={<MapPinned className="h-5 w-5" />}
          title="Яндекс Карты"
          description="Ключ JavaScript API для карт на сайте. Ограничьте его в кабинете разработчика по адресу сайта."
          badge={<StatusBadge ok={Boolean(st?.maps.keySet)} okText="Ключ задан" offText="Без ключа" />}
          fields={[{ key: 'yandex_maps_api_key', label: 'Ключ API', placeholder: 'xxxxxxxx-xxxx-…' }]}
          values={values}
          onChange={set}
        />

        <IntegrationCard
          icon={<Database className="h-5 w-5" />}
          title="Фиды застройщиков"
          description="Квартиры, цены и планировки загружаются из фидов автоматически каждые 6 часов."
          badge={<StatusBadge ok={Boolean(st && st.feeds.enabled > 0 && st.feeds.withErrors === 0)} okText="Работают" offText={st?.feeds.withErrors ? `Ошибки: ${st.feeds.withErrors}` : 'Нет фидов'} />}
          values={values}
          onChange={set}
          footer={
            <Link to="/admin/data-sources" className="text-[13px] font-medium text-primary hover:underline">
              Все фиды и ЖК →
            </Link>
          }
        >
          {st ? (
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ['Подключено', st.feeds.enabled],
                ['С ошибкой', st.feeds.withErrors],
                ['Всего ссылок', st.feeds.total],
              ].map(([label, n]) => (
                <div key={String(label)} className="rounded-xl bg-muted/50 py-3">
                  <dd className="text-xl font-bold tabular-nums">{n}</dd>
                  <dt className="text-[12px] text-muted-foreground">{label}</dt>
                </div>
              ))}
              <p className="col-span-3 text-left text-[12px] text-muted-foreground">
                Последнее обновление:{' '}
                {st.feeds.lastSyncedAt ? new Date(st.feeds.lastSyncedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </p>
            </dl>
          ) : null}
        </IntegrationCard>
      </div>

      {/* Панель сохранения появляется, только когда есть изменения */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur transition-transform duration-200 lg:left-60',
          dirty.length ? 'translate-y-0' : 'translate-y-full',
        )}
        aria-hidden={!dirty.length}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {save.isError ? <span className="text-destructive">Не сохранилось — проверьте права и попробуйте ещё раз</span> : `Изменено полей: ${dirty.length}`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setValues(initial)} className="h-10 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
              Отменить
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
