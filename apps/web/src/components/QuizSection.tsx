import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import PrivacyConsent from '@/shared/components/forms/PrivacyConsent';
import { consentPayload, validatePrivacyConsent } from '@/shared/lib/privacy-consent';
import { cleanSourceUrl, readUtm } from '@/shared/lib/utm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Building2, Home, TreePine, Store, Trees, CheckCircle2 } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { typo } from '@/shared/lib/typography';

/* ── Step 1 types ── */
const propertyTypes = [
  { label: 'Квартира', icon: Building2, value: 'apartment' },
  { label: 'Дом', icon: Home, value: 'house' },
  { label: 'Участок', icon: TreePine, value: 'land' },
  { label: 'Коммерция', icon: Store, value: 'commercial' },
  { label: 'Дача', icon: Trees, value: 'dacha' },
];

/* ── Step 2 dynamic fields ── */
const regionOptions = ['Анапа', 'Краснодар', 'Новороссийск', 'Геленджик', 'Сочи', 'Крым', 'Другой'];
const budgetOptions = ['До 3 млн', '3–7 млн', '7–15 млн', '15–30 млн', '30+ млн'];
const roomOptions = ['Студия', '1', '2', '3', '4+'];
const areaOptions = ['До 6 сот.', '6–10 сот.', '10–20 сот.', '20+ сот.'];
const purposeOptions = ['ИЖС', 'СНТ', 'Коммерция', 'Сельхоз'];
const spaceTypeOptions = ['Офис', 'Торговое', 'Склад', 'Свободное'];
const dachaAreaOptions = ['До 50 м²', '50–100 м²', '100–200 м²', '200+ м²'];

type FieldConfig = { label: string; key: string; options: string[] };

const step2Fields: Record<string, FieldConfig[]> = {
  apartment: [
    { label: 'Регион', key: 'region', options: regionOptions },
    { label: 'Бюджет', key: 'budget', options: budgetOptions },
    { label: 'Комнаты', key: 'rooms', options: roomOptions },
  ],
  house: [
    { label: 'Регион', key: 'region', options: regionOptions },
    { label: 'Бюджет', key: 'budget', options: budgetOptions },
    { label: 'Участок', key: 'area', options: areaOptions },
  ],
  land: [
    { label: 'Регион', key: 'region', options: regionOptions },
    { label: 'Бюджет', key: 'budget', options: budgetOptions },
    { label: 'Назначение', key: 'purpose', options: purposeOptions },
  ],
  commercial: [
    { label: 'Регион', key: 'region', options: regionOptions },
    { label: 'Бюджет', key: 'budget', options: budgetOptions },
    { label: 'Тип', key: 'spaceType', options: spaceTypeOptions },
  ],
  dacha: [
    { label: 'Регион', key: 'region', options: regionOptions },
    { label: 'Бюджет', key: 'budget', options: budgetOptions },
    { label: 'Площадь', key: 'dachaArea', options: dachaAreaOptions },
  ],
};

const STEP_TITLES = ['Какой тип недвижимости?', 'Уточните параметры', 'Куда отправить подборку?'];

/**
 * Поля ввода держим на 16px: при меньшем кегле Safari на iPhone
 * зумит страницу в момент фокуса, и вёрстка «уезжает».
 */
const inputClass =
  'h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10';

const chipBase =
  'rounded-xl border text-sm font-medium transition-all touch-manipulation disabled:opacity-40';
const chipIdle = 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted/40';
const chipActive = 'border-primary bg-accent text-accent-foreground ring-1 ring-primary';

const QuizSection = () => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canNext =
    step === 0
      ? !!selectedType
      : step === 1
        ? (step2Fields[selectedType] || []).every((f) => !!params[f.key])
        : name.trim().length > 0 && contact.trim().length > 0 && consentAccepted;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const consentErr = validatePrivacyConsent(consentAccepted);
    if (consentErr) {
      setConsentError(consentErr);
      return;
    }
    setConsentError(null);
    setSubmitting(true);
    setError('');
    try {
      const comment = Object.entries(params)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      await apiPost('/requests', {
        name,
        phone: contact,
        type: 'SELECTION',
        comment: `Тип: ${selectedType}. ${comment}`,
        sourceUrl: cleanSourceUrl(),
        ...consentPayload(),
        ...readUtm(),
      });
      void queryClient.invalidateQueries({ queryKey: ['requests', 'me'] });
      setSubmitted(true);
    } catch {
      setError('Не удалось отправить заявку. Попробуйте позже.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === 2) handleSubmit();
    else setStep((s) => s + 1);
  };

  if (submitted) {
    return (
      <section className="section-y">
        <div className="container-page">
          <div className="mx-auto max-w-[560px] rounded-[28px] border border-border bg-card px-6 py-12 text-center shadow-sm sm:px-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold sm:text-2xl">Заявка принята</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              {typo('Мы уже подбираем варианты. Менеджер свяжется с вами в течение 2 часов.')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-y" aria-labelledby="quiz-title">
      <div className="container-page">
        {/* Узкая колонка: анкета читается как один спокойный разговор,
            а не как панель во всю ширину экрана */}
        <div className="mx-auto max-w-[760px]">
          <div className="text-center">
            <p className="text-overline text-primary">Бесплатно</p>
            <h2 id="quiz-title" className="text-section-title mt-3">
              Подберём объект
            </h2>
            <p className="mx-auto mt-3 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground">
              {typo('Три коротких вопроса, и мы пришлём варианты, которые подходят именно вам.')}
            </p>
          </div>

          <div className="mt-8 rounded-[28px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_40px_-24px_rgba(16,24,40,0.3)] sm:mt-10 sm:p-10 lg:p-12">
            {/* Прогресс */}
            <div className="flex items-center gap-4">
              <div className="flex flex-1 gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-300',
                      i <= step ? 'bg-primary' : 'bg-border',
                    )}
                  />
                ))}
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {step + 1}&nbsp;/&nbsp;3
              </span>
            </div>

            <p className="mt-7 text-lg font-semibold sm:text-xl">{STEP_TITLES[step]}</p>

            {/* Шаг 1 — тип */}
            {step === 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {propertyTypes.map((pt) => {
                  const Icon = pt.icon;
                  const active = selectedType === pt.value;
                  return (
                    <button
                      key={pt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedType(pt.value)}
                      className={cn(
                        chipBase,
                        active ? chipActive : chipIdle,
                        'flex min-h-[104px] flex-col items-start justify-between gap-3 p-4 text-left',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-[15px] font-medium">{pt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Шаг 2 — параметры */}
            {step === 1 && selectedType && (
              <div className="mt-6 space-y-6">
                {step2Fields[selectedType].map((field) => (
                  <div key={field.key}>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {field.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {field.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={params[field.key] === opt}
                          onClick={() => setParams((p) => ({ ...p, [field.key]: opt }))}
                          className={cn(
                            chipBase,
                            params[field.key] === opt ? chipActive : chipIdle,
                            'flex h-11 items-center px-4',
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Шаг 3 — контакты */}
            {step === 2 && (
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Имя
                    </span>
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="Как к вам обращаться"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Телефон или Telegram
                    </span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      placeholder="+7 900 000-00-00"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
                <PrivacyConsent
                  checked={consentAccepted}
                  onCheckedChange={(next) => {
                    setConsentAccepted(next);
                    if (next) setConsentError(null);
                  }}
                  error={consentError}
                />
              </div>
            )}

            {error ? <p className="mt-5 text-sm text-destructive">{error}</p> : null}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
              <Button
                type="button"
                variant="ghost"
                disabled={step === 0}
                onClick={() => setStep((s) => s - 1)}
                className="h-11 touch-manipulation disabled:opacity-0"
              >
                Назад
              </Button>
              <Button
                variant="primary"
                disabled={!canNext || submitting}
                onClick={handleNext}
                className="h-11 min-w-[150px] px-6"
              >
                {submitting ? 'Отправка…' : step === 2 ? 'Получить подборку' : 'Далее'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QuizSection;
