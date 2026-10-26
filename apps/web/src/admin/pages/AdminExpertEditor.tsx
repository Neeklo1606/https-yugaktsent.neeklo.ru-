import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { btnClass } from '@/redesign/lib/button-styles';
import DemoModeNotice from '@/admin/components/DemoModeNotice';
import ExpertAvatar from '@/shared/experts/ExpertAvatar';
import ExpertLinkIcon from '@/shared/experts/ExpertLinkIcon';
import { useQrDataUrl } from '@/shared/experts/useQrDataUrl';
import { useExpert } from '@/shared/experts/useExpert';
import {
  EXPERT_SEED,
  expertCanonicalUrl,
  expertPath,
  hasExpertDraft,
  isExpertDemoEditingEnabled,
  resetExpertDraft,
  saveExpertDraft,
  type ExpertCtaTarget,
  type ExpertGuide,
  type ExpertLink,
  type ExpertLinkType,
  type ExpertPhone,
  type ExpertProfile,
  type ExpertVideo,
} from '@/shared/experts/expert-profile';

const LINK_TYPES: { value: ExpertLinkType; label: string }[] = [
  { value: 'max', label: 'MAX (личные сообщения)' },
  { value: 'telegram', label: 'Telegram (личные сообщения)' },
  { value: 'telegram_channel', label: 'Telegram-канал' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'vk', label: 'ВКонтакте' },
  { value: 'dzen', label: 'Дзен' },
  { value: 'rutube', label: 'Rutube' },
  { value: 'website', label: 'Сайт' },
];

const CTA_OPTIONS: { value: ExpertCtaTarget; label: string }[] = [
  { value: 'max', label: 'Написать в MAX' },
  { value: 'telegram_channel', label: 'Telegram-канал' },
  { value: 'lead_form', label: 'Форма заявки сайта' },
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());
const uid = () => Math.random().toString(36).slice(2, 9);

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/* ─── Мелкие строительные блоки формы ─── */

const Panel = ({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) => (
  <section id={id} className="surface-card p-4 sm:p-5">
    <h2 className="text-base font-semibold">{title}</h2>
    {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
    <div className="mt-4 grid gap-4">{children}</div>
  </section>
);

const Field = ({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; htmlFor?: string }) => (
  <div className="grid gap-1.5">
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
      {label}
    </label>
    {children}
    {error ? <p className="text-[12px] text-destructive">{error}</p> : hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
  </div>
);

const RowTools = ({ onUp, onDown, onRemove, upDisabled, downDisabled }: { onUp: () => void; onDown: () => void; onRemove: () => void; upDisabled: boolean; downDisabled: boolean }) => (
  <div className="flex shrink-0 items-center gap-1">
    <button type="button" aria-label="Выше" disabled={upDisabled} onClick={onUp} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-soft disabled:opacity-30">
      <ArrowUp className="h-4 w-4" />
    </button>
    <button type="button" aria-label="Ниже" disabled={downDisabled} onClick={onDown} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-soft disabled:opacity-30">
      <ArrowDown className="h-4 w-4" />
    </button>
    <button type="button" aria-label="Удалить" onClick={onRemove} className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10">
      <Trash2 className="h-4 w-4" />
    </button>
  </div>
);

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:border-focus focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/20';

/* ─── Экран ─── */

export default function AdminExpertEditor() {
  const { slug = '' } = useParams<{ slug: string }>();
  const stored = useExpert(slug);
  const [draft, setDraft] = useState<ExpertProfile | null>(stored);
  const [slugUnlocked, setSlugUnlocked] = useState(false);
  const editable = isExpertDemoEditingEnabled();

  useEffect(() => {
    setDraft(stored);
    // Перечитываем только при смене эксперта, чтобы не затирать ввод
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const canonical = draft ? expertCanonicalUrl(draft.slug) : '';
  const qr = useQrDataUrl(canonical, !!draft, 512);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored]);

  if (!draft) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Эксперт не найден.</p>
        <Link to="/admin/experts" className="mt-3 inline-flex text-primary underline">
          К списку
        </Link>
      </div>
    );
  }

  const set = <K extends keyof ExpertProfile>(key: K, value: ExpertProfile[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setLink = (i: number, patch: Partial<ExpertLink>) => set('links', draft.links.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const setVideo = (i: number, patch: Partial<ExpertVideo>) => set('videos', draft.videos.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const setGuide = (i: number, patch: Partial<ExpertGuide>) => set('guides', draft.guides.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  const setPhone = (i: number, patch: Partial<ExpertPhone>) => set('phones', draft.phones.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  /* Проверки: публиковать битые ссылки и пустые обязательные поля нельзя */
  const errors: string[] = [];
  if (!draft.fullName.trim()) errors.push('Укажите имя');
  if (!SLUG_RE.test(draft.slug)) errors.push('Адрес страницы: только латиница, цифры и дефис');
  draft.links.forEach((l) => {
    if (l.visible && !isHttpUrl(l.url)) errors.push(`Ссылка «${l.title || 'без названия'}»: нужен адрес https://…`);
  });
  draft.videos.forEach((v) => {
    if (v.visible && !isHttpUrl(v.url)) errors.push(`Видео «${v.title || 'без названия'}»: нужен адрес https://…`);
  });
  draft.guides.forEach((g) => {
    if (g.published && !isHttpUrl(g.fileUrl ?? '')) errors.push(`Гайд «${g.title || 'без названия'}»: без файла он не будет показан`);
  });
  const blocking = errors.filter((e) => !e.startsWith('Гайд'));

  const save = () => {
    if (!editable) return;
    if (blocking.length) {
      toast.error('Исправьте ошибки', { description: blocking[0] });
      return;
    }
    saveExpertDraft(draft);
    toast.success('Сохранено в демо-режиме', { description: 'Только в этом браузере. Откройте страницу, чтобы проверить.' });
  };

  const reset = () => {
    resetExpertDraft(draft.slug);
    const seed = EXPERT_SEED.find((e) => e.slug === draft.slug) ?? draft;
    setDraft(seed);
    toast('Вернули исходные данные заказчика');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(canonical);
      toast.success('Ссылка скопирована', { description: canonical });
    } catch {
      toast.error('Не удалось скопировать', { description: canonical });
    }
  };

  const seoTitle = draft.seo.title || draft.fullName;
  const seoDesc = draft.seo.description;

  return (
    <div className="max-w-6xl p-4 pb-28 sm:p-6 sm:pb-28">
      <Link to="/admin/experts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Эксперты
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{draft.fullName || 'Без имени'}</h1>
          <p className="mt-0.5 font-mono text-[13px] text-muted-foreground">{expertPath(draft.slug)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={expertPath(draft.slug)} target="_blank" rel="noopener noreferrer" className={btnClass('secondary', { size: 'sm' })}>
            <ExternalLink />
            Предпросмотр
          </a>
          <button type="button" onClick={copy} className={btnClass('secondary', { size: 'sm' })}>
            <Copy />
            Скопировать ссылку
          </button>
          <a
            href={qr ?? undefined}
            download={`qr-${draft.slug}.png`}
            aria-disabled={!qr}
            className={cn(btnClass('secondary', { size: 'sm' }), !qr && 'pointer-events-none opacity-50')}
          >
            <Download />
            Скачать QR
          </a>
        </div>
      </div>

      <DemoModeNotice className="mt-5" />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-5">
          <Panel title="Основное">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя и фамилия" htmlFor="ex-name">
                <Input id="ex-name" value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} />
              </Field>
              <Field label="Город" htmlFor="ex-city">
                <Input id="ex-city" value={draft.city ?? ''} onChange={(e) => set('city', e.target.value)} />
              </Field>
            </div>
            <Field label="Должность и специализация" htmlFor="ex-role" hint="Одна строка под именем на странице">
              <Input id="ex-role" value={draft.role} onChange={(e) => set('role', e.target.value)} />
            </Field>
            <Field label="Опыт" htmlFor="ex-exp" hint="Только формулировка, подтверждённая сотрудником">
              <Input id="ex-exp" value={draft.experience ?? ''} onChange={(e) => set('experience', e.target.value)} />
            </Field>
          </Panel>

          <Panel title="Фото" hint="Портрет от сотрудника, не скриншот и не чужое фото. Пока поле пустое, показываются инициалы.">
            <Field label="Портрет (URL)" htmlFor="ex-photo" error={draft.photoUrl && !isHttpUrl(draft.photoUrl) && !draft.photoUrl.startsWith('/') ? 'Нужен адрес https://… или путь /uploads/…' : null}>
              <Input id="ex-photo" placeholder="https://… или /uploads/…" value={draft.photoUrl ?? ''} onChange={(e) => set('photoUrl', e.target.value || undefined)} />
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium">Как обрежется</p>
              <div className="flex items-end gap-4">
                <figure className="grid gap-1 text-center text-[11px] text-muted-foreground">
                  <ExpertAvatar name={draft.fullName} photoUrl={draft.photoUrl} className="h-[104px] w-[88px]" />
                  Телефон
                </figure>
                <figure className="grid gap-1 text-center text-[11px] text-muted-foreground">
                  <ExpertAvatar name={draft.fullName} photoUrl={draft.photoUrl} className="h-[150px] w-[120px]" />
                  Компьютер
                </figure>
                <figure className="grid gap-1 text-center text-[11px] text-muted-foreground">
                  <ExpertAvatar name={draft.fullName} photoUrl={draft.photoUrl} className="h-16 w-16" />
                  Карточка
                </figure>
              </div>
            </div>
            <Field label="Обложка (URL)" htmlFor="ex-cover" hint="Необязательно. Пока не используется в макете страницы.">
              <Input id="ex-cover" value={draft.coverUrl ?? ''} onChange={(e) => set('coverUrl', e.target.value || undefined)} />
            </Field>
          </Panel>

          <Panel title="Описание">
            <Field label="Короткое приветствие" htmlFor="ex-intro" hint="Первый абзац страницы">
              <Textarea id="ex-intro" rows={2} value={draft.intro} onChange={(e) => set('intro', e.target.value)} />
            </Field>
            <Field label="О себе" htmlFor="ex-about" hint="Абзацы разделяйте пустой строкой — так текст не превращается в стену">
              <Textarea
                id="ex-about"
                rows={7}
                value={draft.about.join('\n\n')}
                onChange={(e) => set('about', e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean))}
              />
            </Field>
          </Panel>

          <Panel title="Рубрики и проекты">
            {draft.projects.map((p, i) => (
              <div key={p.id} className="grid gap-2 rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <Input aria-label="Название рубрики" value={p.title} onChange={(e) => set('projects', draft.projects.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
                  <RowTools
                    upDisabled={i === 0}
                    downDisabled={i === draft.projects.length - 1}
                    onUp={() => set('projects', move(draft.projects, i, -1))}
                    onDown={() => set('projects', move(draft.projects, i, 1))}
                    onRemove={() => set('projects', draft.projects.filter((_, k) => k !== i))}
                  />
                </div>
                <Textarea aria-label="Описание рубрики" rows={2} value={p.description} onChange={(e) => set('projects', draft.projects.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
              </div>
            ))}
            <button type="button" onClick={() => set('projects', [...draft.projects, { id: uid(), title: '', description: '' }])} className={btnClass('secondary', { size: 'sm', className: 'justify-self-start' })}>
              <Plus />
              Добавить рубрику
            </button>
          </Panel>

          <Panel title="Каналы и соцсети" hint="Порядок здесь = порядок на странице. Скрытые и пустые ссылки на сайте не показываются.">
            {draft.links.map((l, i) => (
              <div key={l.id} className={cn('grid gap-2 rounded-lg border border-border p-3', !l.visible && 'opacity-60')}>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-primary">
                    <ExpertLinkIcon type={l.type} className="h-4 w-4" />
                  </span>
                  <select aria-label="Тип" className={selectClass} value={l.type} onChange={(e) => setLink(i, { type: e.target.value as ExpertLinkType })}>
                    {LINK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={l.visible ? 'Скрыть на сайте' : 'Показать на сайте'}
                    title={l.visible ? 'Показывается' : 'Скрыта'}
                    onClick={() => setLink(i, { visible: !l.visible })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-soft"
                  >
                    {l.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <RowTools
                    upDisabled={i === 0}
                    downDisabled={i === draft.links.length - 1}
                    onUp={() => set('links', move(draft.links, i, -1))}
                    onDown={() => set('links', move(draft.links, i, 1))}
                    onRemove={() => set('links', draft.links.filter((_, k) => k !== i))}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="Название" placeholder="Название" value={l.title} onChange={(e) => setLink(i, { title: e.target.value })} />
                  <Input aria-label="Подпись" placeholder="Подпись, например @ug_akcent" value={l.handle ?? ''} onChange={(e) => setLink(i, { handle: e.target.value })} />
                </div>
                <Input
                  aria-label="Адрес"
                  placeholder="https://…"
                  value={l.url}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                  className={cn(l.visible && !isHttpUrl(l.url) && 'border-destructive')}
                />
                {l.type === 'telegram_channel' ? (
                  <p className="text-[12px] text-muted-foreground">Канал на сайте подписан как «Telegram-канал». Для кнопки «Написать в Telegram» добавьте ссылку типа «Telegram (личные сообщения)».</p>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('links', [...draft.links, { id: uid(), type: 'dzen', title: '', url: '', visible: true }])}
              className={btnClass('secondary', { size: 'sm', className: 'justify-self-start' })}
            >
              <Plus />
              Добавить ссылку
            </button>
          </Panel>

          <Panel title="Видео" hint="Порядок = приоритет. Без видео на странице остаётся ссылка на YouTube-канал.">
            {draft.videos.map((v, i) => (
              <div key={v.id} className={cn('grid gap-2 rounded-lg border border-border p-3', !v.visible && 'opacity-60')}>
                <div className="flex items-center gap-2">
                  <Input aria-label="Название видео" placeholder="Название" value={v.title} onChange={(e) => setVideo(i, { title: e.target.value })} />
                  <button type="button" aria-label={v.visible ? 'Скрыть' : 'Показать'} onClick={() => setVideo(i, { visible: !v.visible })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-soft">
                    {v.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <RowTools
                    upDisabled={i === 0}
                    downDisabled={i === draft.videos.length - 1}
                    onUp={() => set('videos', move(draft.videos, i, -1).map((x, k) => ({ ...x, priority: k })))}
                    onDown={() => set('videos', move(draft.videos, i, 1).map((x, k) => ({ ...x, priority: k })))}
                    onRemove={() => set('videos', draft.videos.filter((_, k) => k !== i))}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="Ссылка на видео" placeholder="https://youtu.be/…" value={v.url} onChange={(e) => setVideo(i, { url: e.target.value })} />
                  <Input aria-label="Превью" placeholder="Превью (URL), необязательно" value={v.previewUrl ?? ''} onChange={(e) => setVideo(i, { previewUrl: e.target.value || undefined })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('videos', [...draft.videos, { id: uid(), title: '', url: '', priority: draft.videos.length, visible: true }])}
              className={btnClass('secondary', { size: 'sm', className: 'justify-self-start' })}
            >
              <Plus />
              Добавить видео
            </button>
          </Panel>

          <Panel title="PDF-гайды" hint="Гайд без файла на сайте не показывается — кнопок «Скачать» в никуда не будет.">
            {draft.guides.length === 0 ? <p className="text-sm text-muted-foreground">Гайдов пока нет: секция на странице скрыта.</p> : null}
            {draft.guides.map((g, i) => (
              <div key={g.id} className="grid gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input aria-label="Название гайда" placeholder="Название" value={g.title} onChange={(e) => setGuide(i, { title: e.target.value })} />
                  <label className="flex shrink-0 items-center gap-2 text-[13px]">
                    <Switch checked={g.published} onCheckedChange={(v) => setGuide(i, { published: v })} />
                    Опубл.
                  </label>
                  <RowTools
                    upDisabled={i === 0}
                    downDisabled={i === draft.guides.length - 1}
                    onUp={() => set('guides', move(draft.guides, i, -1))}
                    onDown={() => set('guides', move(draft.guides, i, 1))}
                    onRemove={() => set('guides', draft.guides.filter((_, k) => k !== i))}
                  />
                </div>
                <Input aria-label="Описание гайда" placeholder="Коротко, о чём гайд" value={g.description ?? ''} onChange={(e) => setGuide(i, { description: e.target.value })} />
                <Input aria-label="Файл" placeholder="Ссылка на PDF (загрузка файлов — после подключения backend)" value={g.fileUrl ?? ''} onChange={(e) => setGuide(i, { fileUrl: e.target.value || undefined })} />
              </div>
            ))}
            <button type="button" onClick={() => set('guides', [...draft.guides, { id: uid(), title: '', published: false }])} className={btnClass('secondary', { size: 'sm', className: 'justify-self-start' })}>
              <Plus />
              Добавить гайд
            </button>
          </Panel>

          <Panel title="Контакты">
            {draft.phones.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <Input aria-label="Подпись телефона" className="sm:w-40" value={p.label} onChange={(e) => setPhone(i, { label: e.target.value })} />
                <Input aria-label="Номер" value={p.value} onChange={(e) => setPhone(i, { value: e.target.value })} />
                <Input aria-label="Примечание" placeholder="Примечание" value={p.note ?? ''} onChange={(e) => setPhone(i, { note: e.target.value || undefined })} />
                <RowTools
                  upDisabled={i === 0}
                  downDisabled={i === draft.phones.length - 1}
                  onUp={() => set('phones', move(draft.phones, i, -1))}
                  onDown={() => set('phones', move(draft.phones, i, 1))}
                  onRemove={() => set('phones', draft.phones.filter((_, k) => k !== i))}
                />
              </div>
            ))}
            <button type="button" onClick={() => set('phones', [...draft.phones, { id: uid(), label: 'Телефон', value: '' }])} className={btnClass('secondary', { size: 'sm', className: 'justify-self-start' })}>
              <Plus />
              Добавить телефон
            </button>
            <Field label="Адрес" htmlFor="ex-addr">
              <Input id="ex-addr" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value || undefined)} />
            </Field>
            <Field label="Основное действие" htmlFor="ex-cta">
              <select id="ex-cta" className={selectClass} value={draft.primaryCta} onChange={(e) => set('primaryCta', e.target.value as ExpertCtaTarget)}>
                {CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </Panel>

          <Panel title="Адрес страницы и SEO">
            <Field
              label="Адрес (slug)"
              htmlFor="ex-slug"
              error={!SLUG_RE.test(draft.slug) ? 'Только латиница, цифры и дефис' : null}
              hint={draft.published && !slugUnlocked ? 'Страница опубликована: на этот адрес уже ведут QR-коды. Менять только с редиректом со старого адреса.' : undefined}
            >
              <div className="flex gap-2">
                <Input id="ex-slug" value={draft.slug} disabled={draft.published && !slugUnlocked} onChange={(e) => set('slug', e.target.value.toLowerCase())} className="font-mono" />
                {draft.published && !slugUnlocked ? (
                  <button type="button" onClick={() => setSlugUnlocked(window.confirm('Сменить адрес опубликованной страницы? Старые QR-коды перестанут работать без редиректа.'))} className={btnClass('secondary', { size: 'sm', className: 'shrink-0' })}>
                    <Lock />
                    Изменить
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label="SEO-заголовок" htmlFor="ex-seo-t" hint={`${seoTitle.length} символов, лучше до 60`}>
              <Input id="ex-seo-t" value={draft.seo.title} onChange={(e) => set('seo', { ...draft.seo, title: e.target.value })} />
            </Field>
            <Field label="SEO-описание" htmlFor="ex-seo-d" hint={`${seoDesc.length} символов, лучше 120–160`}>
              <Textarea id="ex-seo-d" rows={3} value={draft.seo.description} onChange={(e) => set('seo', { ...draft.seo, description: e.target.value })} />
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium">Так ссылка выглядит в мессенджере</p>
              <div className="max-w-[420px] overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex aspect-[1.91/1] items-center justify-center bg-surface-soft text-sm text-muted-foreground">
                  {draft.photoUrl ? <img src={draft.photoUrl} alt="" className="h-full w-full object-cover object-top" /> : 'Изображение сайта по умолчанию'}
                </div>
                <div className="p-3">
                  <p className="truncate text-[12px] text-muted-foreground">{canonical.replace(/^https?:\/\//, '').split('/')[0]}</p>
                  <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{seoTitle}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{seoDesc}</p>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="grid content-start gap-5 lg:sticky lg:top-4">
          <Panel title="Публикация">
            <label className="flex items-center justify-between gap-3 text-sm">
              Страница опубликована
              <Switch checked={draft.published} onCheckedChange={(v) => set('published', v)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Показывать на странице «Команда»
              <Switch checked={draft.showOnTeamPage} onCheckedChange={(v) => set('showOnTeamPage', v)} />
            </label>
            {errors.length > 0 ? (
              <ul className="grid gap-1 rounded-lg bg-destructive/5 p-3 text-[12px] text-destructive">
                {errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-success">Ошибок нет: ссылки и поля в порядке.</p>
            )}
          </Panel>
          <Panel title="QR-код">
            <div className="mx-auto aspect-square w-40 overflow-hidden rounded-lg border border-border bg-white p-1.5">
              {qr ? <img src={qr} alt={`QR: ${canonical}`} className="h-full w-full" /> : <div className="h-full w-full animate-pulse bg-muted" />}
            </div>
            <p className="break-all text-center text-[12px] text-muted-foreground">{canonical}</p>
          </Panel>
        </aside>
      </div>

      {/* Панель действий всегда под рукой: длинная форма, а сохранить нужно в любой момент */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:left-[var(--admin-sidebar-w,0px)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-[13px] text-muted-foreground">
            {!editable ? 'Редактирование выключено на этом сервере' : dirty ? 'Есть несохранённые изменения' : hasExpertDraft(draft.slug) ? 'Демо-правки сохранены в этом браузере' : 'Исходные данные заказчика'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={!editable} className={btnClass('secondary', { size: 'sm' })}>
              <RotateCcw />
              <span className="hidden sm:inline">Сбросить</span>
            </button>
            <button type="button" onClick={save} disabled={!editable || !dirty} className={btnClass('primary', { size: 'sm' })}>
              <Save />
              Сохранить (демо)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
