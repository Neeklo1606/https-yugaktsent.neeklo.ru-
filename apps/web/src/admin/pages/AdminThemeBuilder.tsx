import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Copy, Eye, Heart, MapPin, Monitor, Palette, RotateCcw, Smartphone, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DemoModeNotice from '@/admin/components/DemoModeNotice';
import {
  THEME_PRESETS,
  THEME_SETTING_KEY,
  THEME_SHAPES,
  THEME_TOKENS,
  applyThemeOverrides,
  readThemeDraft,
  writeThemeDraft,
  type ThemeOverrides,
  type ThemeShapeKey,
  type ThemeTokenKey,
} from '@/shared/theme/theme-engine';

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Мини-витрина в изолированном контейнере: тема применяется только к ней, админка не перекрашивается */
const ThemePreview = ({ overrides, device }: { overrides: ThemeOverrides; device: 'desktop' | 'mobile' }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) applyThemeOverrides(overrides, ref.current);
  }, [overrides]);
  const mobile = device === 'mobile';

  return (
    <div className={cn('mx-auto overflow-hidden rounded-card border border-border shadow-raised transition-[width]', mobile ? 'w-[360px] max-w-full' : 'w-full')}>
      <div ref={ref} className="bg-background text-foreground">
        <div className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
          <span className="text-[14px] font-semibold">ЮгАкцент</span>
          {!mobile ? (
            <span className="flex gap-4 text-[13px] text-muted-foreground">
              <span className="text-primary">Каталог</span>
              <span>Новостройки</span>
              <span>О компании</span>
            </span>
          ) : null}
          <span className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">Заявка</span>
        </div>

        <div className="bg-graphite px-4 py-7 text-white">
          <p className="text-[12px] text-white/75">Новостройки Анапы</p>
          <p className={cn('mt-1 font-semibold leading-tight tracking-tight', mobile ? 'text-[24px]' : 'text-[32px]')}>ГК Sun Garden</p>
          <p className="mt-1 text-[14px] text-white/85">Квартиры от 15,2 млн ₽</p>
          <div className="mt-4 flex gap-2">
            <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-[13px] font-semibold text-foreground">
              Смотреть комплекс <ArrowRight className="h-4 w-4" />
            </span>
            {!mobile ? <span className="inline-flex h-10 items-center rounded-lg border border-white/40 px-4 text-[13px] text-white">Подобрать объект</span> : null}
          </div>
        </div>

        <div className={cn('grid gap-3 p-4', mobile ? 'grid-cols-1' : 'grid-cols-[1.2fr_1fr]')}>
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <div className="relative aspect-[16/9] bg-surface-soft">
              <span className="absolute left-2.5 top-2.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium">Строится</span>
              <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <Heart className="h-4 w-4 text-foreground/70" />
              </span>
            </div>
            <div className="p-3">
              <p className="text-[15px] font-semibold">Eden Family Hotel</p>
              <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Анапа · 1 кв. 2027
              </p>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-[15px] font-semibold tabular-nums">от 7,5 млн ₽</span>
                <span className="text-[12px] font-medium text-primary">Квартиры →</span>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-border bg-card p-3">
            <p className="text-[14px] font-semibold">Оставьте заявку</p>
            <div className="mt-2 grid gap-2">
              <span className="flex h-10 items-center rounded-lg border border-input bg-card px-3 text-[13px] text-muted-foreground">Имя</span>
              <span className="flex h-10 items-center rounded-lg border-2 border-focus bg-card px-3 text-[13px]">+7 (918) 477-99-85</span>
              <span className="flex h-10 items-center justify-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">Получить подборку</span>
              <span className="flex h-10 items-center justify-center rounded-lg border border-border bg-card text-[13px] font-medium">Позвонить</span>
            </div>
            <p className="mt-2 flex items-center gap-1 text-[12px] text-success">
              <Check className="h-3.5 w-3.5" /> Свободно
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Внешний вид → Тема сайта (ТЗ v3, 6.3). Работает поверх Theme Engine: те же CSS-переменные,
 * что у витрины и админки. Публикация — через настройку сайта `theme_tokens` после подключения.
 */
export default function AdminThemeBuilder() {
  const [draft, setDraft] = useState<ThemeOverrides>(() => readThemeDraft() ?? {});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [appliedToSite, setAppliedToSite] = useState(() => readThemeDraft() != null);

  const color = (key: ThemeTokenKey) => draft[key] ?? THEME_TOKENS.find((t) => t.key === key)!.hex;
  const shapePx = (key: ThemeShapeKey) => Number((draft[key] ?? `${THEME_SHAPES.find((x) => x.key === key)!.px}px`).replace('px', ''));

  const setColor = (key: ThemeTokenKey, hex: string) => {
    const def = THEME_TOKENS.find((t) => t.key === key)!.hex;
    setDraft((d) => {
      const next = { ...d };
      if (hex.toLowerCase() === def.toLowerCase()) delete next[key];
      else next[key] = hex;
      return next;
    });
  };
  const setShape = (key: ThemeShapeKey, px: number) => {
    const def = THEME_SHAPES.find((x) => x.key === key)!.px;
    setDraft((d) => {
      const next = { ...d };
      if (px === def) delete next[key];
      else next[key] = `${px}px`;
      return next;
    });
  };

  const activePreset = useMemo(
    () => THEME_PRESETS.find((p) => JSON.stringify(p.overrides) === JSON.stringify(Object.fromEntries(Object.entries(draft).filter(([k]) => !k.startsWith('radius'))))),
    [draft],
  );
  const json = JSON.stringify(draft, null, 2);

  const applyToSite = () => {
    writeThemeDraft(draft);
    setAppliedToSite(Object.keys(draft).length > 0);
    toast.success('Черновик применён в этом браузере', { description: 'Откройте сайт в соседней вкладке — он уже в новой теме. Посетители видят прежнюю.' });
  };
  const discardDraft = () => {
    writeThemeDraft(null);
    setAppliedToSite(false);
    setDraft({});
    toast('Черновик сброшен, тема по умолчанию');
  };
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft));
      toast.success('JSON скопирован', { description: `Значение для настройки сайта «${THEME_SETTING_KEY}».` });
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  return (
    <div className="max-w-6xl p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Palette className="h-6 w-6 text-primary" />
        Тема сайта
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Цвета и скругления витрины. Все компоненты берут их из одной темы, поэтому изменение видно сразу везде: кнопки, карточки, формы, фокус.
      </p>

      <DemoModeNotice
        className="mt-5"
        description="Предпросмотр и черновик работают сразу и только в этом браузере. Публикация для всех посетителей — после подключения сохранения настройки сайта; до тех пор тему можно передать как JSON."
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <section className="surface-card p-4">
            <h2 className="text-[15px] font-semibold">Пресеты</h2>
            <div className="mt-3 grid gap-2">
              {THEME_PRESETS.map((p) => {
                const primary = p.overrides.primary ?? THEME_TOKENS[0].hex;
                const soft = p.overrides['surface-soft'] ?? THEME_TOKENS.find((t) => t.key === 'surface-soft')!.hex;
                const active = activePreset?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft((d) => ({ ...Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('radius'))), ...p.overrides }))}
                    className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[14px] transition-colors', active ? 'border-primary bg-surface-soft' : 'border-border hover:border-primary/40')}
                  >
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-6 w-6 rounded-md border border-black/10" style={{ background: primary }} />
                      <span className="h-6 w-6 rounded-md border border-black/10" style={{ background: soft }} />
                    </span>
                    <span className="flex-1">{p.name}</span>
                    {active ? <Check className="h-4 w-4 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="surface-card p-4">
            <h2 className="text-[15px] font-semibold">Цвета</h2>
            <div className="mt-3 grid gap-2.5">
              {THEME_TOKENS.map((t) => {
                const v = color(t.key);
                return (
                  <label key={t.key} className="flex items-center gap-3 text-[13px]">
                    <input type="color" value={v} onChange={(e) => setColor(t.key, e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-0.5" aria-label={t.label} />
                    <span className="min-w-0 flex-1 leading-snug">{t.label}</span>
                    <Input
                      value={v}
                      onChange={(e) => HEX_RE.test(e.target.value) && setColor(t.key, e.target.value)}
                      className="h-9 w-[92px] font-mono text-[12px]"
                      aria-label={`${t.label}, HEX`}
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="surface-card p-4">
            <h2 className="text-[15px] font-semibold">Форма</h2>
            <div className="mt-3 grid gap-4">
              {THEME_SHAPES.map((x) => (
                <label key={x.key} className="grid gap-1.5 text-[13px]">
                  <span className="flex justify-between">
                    {x.label}
                    <span className="tabular-nums text-muted-foreground">{shapePx(x.key)} px</span>
                  </span>
                  <input type="range" min={x.min} max={x.max} step={1} value={shapePx(x.key)} onChange={(e) => setShape(x.key, Number(e.target.value))} className="accent-[hsl(var(--primary))]" />
                </label>
              ))}
              <p className="text-[12px] text-muted-foreground">Шрифт — Inter, один на всю витрину: смена гарнитуры требует проверки кириллицы и скорости, поэтому не вынесена в настройки.</p>
            </div>
          </section>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-surface-soft p-1" role="tablist" aria-label="Устройство">
              {(
                [
                  ['desktop', Monitor, 'Компьютер'],
                  ['mobile', Smartphone, 'Телефон'],
                ] as const
              ).map(([d, Icon, label]) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={device === d}
                  onClick={() => setDevice(d)}
                  className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium', device === d ? 'bg-card shadow-card' : 'text-muted-foreground')}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            <span className="text-[13px] text-muted-foreground">
              {Object.keys(draft).length ? `Изменено: ${Object.keys(draft).length}` : 'Тема по умолчанию'}
              {appliedToSite ? ' · черновик включён на сайте в этом браузере' : ''}
            </span>
          </div>

          <ThemePreview overrides={draft} device={device} />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={applyToSite}>
              <Eye />
              Применить к сайту (только у меня)
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDraft(readThemeDraft() ?? {})}>
              <Undo2 />
              Отменить несохранённое
            </Button>
            <Button type="button" variant="secondary" onClick={discardDraft}>
              <RotateCcw />
              Вернуть по умолчанию
            </Button>
            <Button type="button" variant="secondary" onClick={copyJson} disabled={!Object.keys(draft).length}>
              <Copy />
              Скопировать JSON
            </Button>
            <Button type="button" variant="secondary" disabled title="После подключения сохранения настроек на сервере">
              Опубликовать для всех
            </Button>
          </div>

          <details className="mt-4 text-[13px]">
            <summary className="cursor-pointer text-muted-foreground">JSON темы ({THEME_SETTING_KEY})</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-soft p-3 font-mono text-[12px]">{json}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
