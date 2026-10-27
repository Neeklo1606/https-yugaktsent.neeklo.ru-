import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Clock, Database, Plus, RefreshCw, SearchCheck, ShieldCheck, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import DemoModeNotice from '@/admin/components/DemoModeNotice';
import DataQualityPanel from '@/admin/components/DataQualityPanel';
import {
  CLIENT_SOURCES,
  FEED_FORMAT_LABEL,
  FEED_SCHEDULE_LABEL,
  FIELD_MAPPING,
  readDemoSources,
  validateFeedUrl,
  writeDemoSources,
  type DataSource,
  type FeedFormat,
  type FeedSchedule,
} from '@/admin/lib/data-sources';

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:border-focus focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/20';

const StatusBadge = ({ s }: { s: DataSource }) =>
  s.status === 'active' ? (
    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[12px] font-medium text-success">Работает</span>
  ) : s.status === 'error' ? (
    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] font-medium text-destructive">Ошибка</span>
  ) : (
    <span className="whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-medium text-warning">Ожидает подключения</span>
  );

const dash = (v: number | null | undefined) => (v == null ? <span className="text-muted-foreground">нет данных</span> : v.toLocaleString('ru-RU'));

/** Кнопки серверных действий: видны, но честно не выполняются до подключения backend */
const ServerActions = ({ compact = false }: { compact?: boolean }) => (
  <div className={cn('flex flex-wrap gap-2', compact && 'gap-1.5')}>
    {[
      { icon: SearchCheck, label: 'Проверить фид' },
      { icon: RefreshCw, label: 'Синхронизировать сейчас' },
      { icon: AlertTriangle, label: 'Ошибки' },
    ].map(({ icon: Icon, label }) => (
      <Button key={label} type="button" variant="secondary" size="sm" disabled title="Выполняется на сервере после подключения backend">
        <Icon />
        {label}
      </Button>
    ))}
  </div>
);

export default function AdminDataSources() {
  const [demo, setDemo] = useState<DataSource[]>(() => readDemoSources());
  const sources = useMemo(() => [...CLIENT_SOURCES, ...demo], [demo]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const open = sources.find((s) => s.id === openId) ?? null;

  const [form, setForm] = useState({ name: '', format: 'profitbase_xml' as FeedFormat, url: '', city: 'Анапа', complex: '', schedule: 'every6h' as FeedSchedule });
  const [urlError, setUrlError] = useState<string | null>(null);

  const addSource = () => {
    const check = validateFeedUrl(form.url);
    if ('error' in check) {
      setUrlError(check.error);
      return;
    }
    if (!form.name.trim()) {
      toast.error('Укажите название источника');
      return;
    }
    // Полный адрес здесь же и выбрасываем: в браузере остаётся только маска
    const next: DataSource = {
      id: `demo-${Date.now()}`,
      name: form.name.trim(),
      format: form.format,
      city: form.city.trim() || 'Анапа',
      complexName: form.complex.trim() || undefined,
      urlMasked: check.masked,
      schedule: form.schedule,
      status: 'pending_backend',
      warnings: [],
      origin: 'demo',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const list = [...demo, next];
    writeDemoSources(list);
    setDemo(list);
    setAddOpen(false);
    setForm({ name: '', format: 'profitbase_xml', url: '', city: 'Анапа', complex: '', schedule: 'every6h' });
    setUrlError(null);
    toast.success('Источник добавлен в демо-список', { description: 'Адрес не сохранён: его заведут на сервере при подключении.' });
  };

  const removeDemo = (id: string) => {
    const list = demo.filter((s) => s.id !== id);
    writeDemoSources(list);
    setDemo(list);
    setOpenId(null);
  };

  const warningsTotal = sources.reduce((n, s) => n + s.warnings.length, 0);

  return (
    <div className="max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Database className="h-6 w-6 text-primary" />
            Источники данных
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Фиды застройщиков и агрегаторов: откуда приходят ЖК, квартиры, цены и фото. {sources.length} источников, {warningsTotal} предупреждений.
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus />
          Добавить источник
        </Button>
      </div>

      <DemoModeNotice
        className="mt-5"
        description="Проверка, загрузка и расписание фидов работают только на сервере. Здесь — список, предупреждения и сопоставление полей для подключения; синхронизация не имитируется. Новые записи хранятся только в этом браузере и без полного адреса."
      />

      {/* Таблица на широком экране */}
      <div className="mt-5 hidden overflow-hidden rounded-card border border-border bg-card md:block">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-surface-soft text-[12px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Источник</th>
              <th className="px-4 py-2.5 font-medium">Формат</th>
              <th className="px-4 py-2.5 font-medium">Город / ЖК</th>
              <th className="px-4 py-2.5 font-medium">URL</th>
              <th className="px-4 py-2.5 font-medium">Синхронизация</th>
              <th className="px-4 py-2.5 font-medium text-right">Объекты</th>
              <th className="px-4 py-2.5 font-medium text-right">Фото</th>
              <th className="px-4 py-2.5 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sources.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-surface-soft/60" onClick={() => setOpenId(s.id)}>
                <td className="px-4 py-3">
                  <button type="button" className="text-left font-medium hover:text-primary" onClick={() => setOpenId(s.id)}>
                    {s.name}
                  </button>
                  {s.warnings.length ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[12px] text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" /> {s.warnings.length} предупр.
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{FEED_FORMAT_LABEL[s.format]}</td>
                <td className="px-4 py-3">
                  {s.city}
                  {s.complexName ? <span className="block text-[12px] text-muted-foreground">{s.complexName}</span> : null}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{s.urlMasked}</td>
                <td className="px-4 py-3 text-[13px]">
                  {s.lastSyncAt ?? <span className="text-muted-foreground">не запускалась</span>}
                  <span className="block text-[12px] text-muted-foreground">{FEED_SCHEDULE_LABEL[s.schedule]}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{dash(s.objects)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dash(s.photos)}</td>
                <td className="px-4 py-3">
                  <StatusBadge s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Карточки на телефоне */}
      <ul className="mt-5 grid gap-3 md:hidden">
        {sources.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpenId(s.id)} className="surface-card w-full p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{s.name}</span>
                <StatusBadge s={s} />
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {FEED_FORMAT_LABEL[s.format]} · {s.city}
                {s.complexName ? ` · ${s.complexName}` : ''}
              </p>
              {s.warnings.length ? (
                <p className="mt-2 flex items-center gap-1 text-[13px] text-warning">
                  <AlertTriangle className="h-4 w-4" /> {s.warnings[0].text}
                </p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            Что уже работает на сервере
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Синхронизация Profitbase и ДомКлик для текущих ЖК запущена на сервере (служба, раз в 6 часов). Её ссылки и статус — в разделе действующих фидов, нужен вход администратора.
          </p>
          <Link to="/admin/feed-links" className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-primary hover:underline">
            Действующие фиды <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Безопасность загрузки
          </h2>
          <ul className="mt-2 grid gap-1 text-[14px] text-muted-foreground">
            <li>• Фид скачивает только сервер, браузер к нему не обращается.</li>
            <li>• Разрешённые домены, только https, без внутренних адресов (защита от SSRF).</li>
            <li>• Лимит размера, числа редиректов и таймауты; ошибки — в журнал.</li>
            <li>• Адрес с токеном не попадает в код сайта и логи браузера.</li>
          </ul>
        </section>
      </div>

      <DataQualityPanel className="mt-8" />

      {/* Подробности источника */}
      <Sheet open={open != null} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {open ? (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{open.name}</SheetTitle>
                <SheetDescription>
                  {FEED_FORMAT_LABEL[open.format]} · {open.city}
                  {open.complexName ? ` · ${open.complexName}` : ''} · <span className="font-mono">{open.urlMasked}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex items-center gap-2">
                <StatusBadge s={open} />
                <span className="text-[13px] text-muted-foreground">Демо: действия выполнит сервер после подключения.</span>
              </div>
              <div className="mt-3">
                <ServerActions compact />
              </div>

              <h3 className="mt-6 text-[15px] font-semibold">Предупреждения</h3>
              {open.warnings.length ? (
                <ul className="mt-2 grid gap-2">
                  {open.warnings.map((w) => (
                    <li key={w.code} className="flex gap-2 rounded-lg bg-warning-soft p-3 text-[14px]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      {w.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[14px] text-muted-foreground">Появятся после первой проверки на сервере: 0 фото, дубли, битый XML, объекты без цены, без связанного ЖК.</p>
              )}

              <h3 className="mt-6 text-[15px] font-semibold">Сопоставление полей</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Ожидаемое: какие теги фида сервер положит в поля сайта.</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-surface-soft text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Поле сайта</th>
                      <th className="px-3 py-2 font-medium">Тег в фиде</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {FIELD_MAPPING.map((m) => (
                      <tr key={m.field}>
                        <td className="px-3 py-2">{m.field}</td>
                        <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">
                          {open.format === 'cian_xml' ? m.cian : open.format === 'jcat' ? m.jcat : open.format === 'auto' ? 'по формату фида' : m.profitbase}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="mt-6 text-[15px] font-semibold">Журнал</h3>
              <ul className="mt-2 grid gap-1 text-[13px] text-muted-foreground">
                <li>
                  {open.createdAt} · {open.origin === 'client' ? 'Получен от заказчика, ожидает подключения' : 'Добавлен в демо-списке этого браузера'}
                </li>
              </ul>

              {open.origin === 'demo' ? (
                <Button type="button" variant="secondary" className="mt-6 text-destructive" onClick={() => removeDemo(open.id)}>
                  <Trash2 />
                  Убрать из демо-списка
                </Button>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Новый источник */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый источник</DialogTitle>
            <DialogDescription>Адрес проверяется только по форме. Загрузку и расписание включит сервер при подключении.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-[13px] font-medium">
              Название
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например, ЖК «Долина»" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[13px] font-medium">
                Формат
                <select className={selectClass} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as FeedFormat })}>
                  {Object.entries(FEED_FORMAT_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium">
                Расписание
                <select className={selectClass} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value as FeedSchedule })}>
                  {Object.entries(FEED_SCHEDULE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-[13px] font-medium">
              URL фида
              <Input
                value={form.url}
                onChange={(e) => {
                  setForm({ ...form, url: e.target.value });
                  setUrlError(null);
                }}
                placeholder="https://…"
                autoComplete="off"
                spellCheck={false}
                className={cn(urlError && 'border-destructive')}
              />
              {urlError ? <span className="text-[12px] font-normal text-destructive">{urlError}</span> : <span className="text-[12px] font-normal text-muted-foreground">В браузере сохранится только домен. Полный адрес с токеном заводится на сервере.</span>}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[13px] font-medium">
                Город
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium">
                ЖК
                <Input value={form.complex} onChange={(e) => setForm({ ...form, complex: e.target.value })} placeholder="Если фид одного ЖК" />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={addSource}>
              Добавить (демо)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
