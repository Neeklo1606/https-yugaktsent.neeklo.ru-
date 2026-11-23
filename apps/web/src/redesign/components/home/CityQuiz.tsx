import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import LeadForm from '@/shared/components/LeadForm';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { buildCatalogFilterUrl } from '@/redesign/lib/catalog-filter-links';
import { btnClass } from '@/redesign/lib/button-styles';
import { typo } from '@/shared/lib/typography';
import {
  CITY_QUIZ_QUESTIONS,
  quizSummary,
  recommendCity,
  type QuizAnswers,
  type QuizCity,
} from '@/redesign/components/home/CityQuizLogic';

const TOTAL_STEPS = CITY_QUIZ_QUESTIONS.length + 1;

/** «Смотреть новостройки Анапы» */
const CITY_GENITIVE: Record<QuizCity, string> = {
  Анапа: 'Анапы',
  Новороссийск: 'Новороссийска',
  Краснодар: 'Краснодара',
  Майкоп: 'Майкопа',
};

/**
 * Квиз на главной: четыре коротких вопроса → город юга под семью и бюджет →
 * ссылка в каталог этого города и короткая форма. Ответы уходят в комментарий заявки.
 */
const CityQuiz = () => {
  const uid = useId();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const { rows } = useDefaultRegionId();

  const question = CITY_QUIZ_QUESTIONS[step];
  const done = step >= CITY_QUIZ_QUESTIONS.length;
  const rec = useMemo(() => (done ? recommendCity(answers) : null), [done, answers]);

  const catalogHref = useMemo(() => {
    if (!rec) return '/catalog';
    const region = rows?.find((r) => r.name?.trim().toLowerCase() === rec.city.toLowerCase());
    return region ? buildCatalogFilterUrl(region.id) : '/catalog';
  }, [rec, rows]);

  const choose = (value: string) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    setStep((s) => s + 1);
  };

  const restart = () => {
    setAnswers({});
    setStep(0);
  };

  const titleId = `${uid}-title`;
  const questionId = `${uid}-q`;

  return (
    <section className="container-page py-6 lg:py-10" aria-labelledby={titleId}>
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 lg:p-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-10">
          <div>
            <p className="text-overline inline-flex items-center gap-1.5 text-primary">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Подбор города
            </p>
            <h2 id={titleId} className="text-title mt-2">
              {typo('Не определились с городом?')}
            </h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
              {typo('Подберём город юга под вашу семью за 30 секунд.')}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                Шаг {Math.min(step + 1, TOTAL_STEPS)} из {TOTAL_STEPS}
              </p>
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => (done ? restart() : setStep((s) => s - 1))}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
                >
                  {done ? <RotateCcw className="h-4 w-4" aria-hidden /> : <ArrowLeft className="h-4 w-4" aria-hidden />}
                  {done ? 'Пройти заново' : 'Назад'}
                </button>
              ) : null}
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Прогресс подбора"
              aria-valuemin={1}
              aria-valuemax={TOTAL_STEPS}
              aria-valuenow={Math.min(step + 1, TOTAL_STEPS)}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${(Math.min(step + 1, TOTAL_STEPS) / TOTAL_STEPS) * 100}%` }}
              />
            </div>

            {question ? (
              <div className="mt-5">
                <h3 id={questionId} className="text-lg font-semibold">
                  {question.title}
                </h3>
                <div
                  role="group"
                  aria-labelledby={questionId}
                  className={cn(
                    'mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2',
                    question.options.length === 4 && 'sm:grid-cols-4',
                    question.options.length === 3 && 'sm:grid-cols-3',
                  )}
                >
                  {question.options.map((o) => {
                    const active = answers[question.id] === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => choose(o.value)}
                        className={cn(
                          'press flex min-h-[52px] items-center justify-center rounded-xl border px-3 py-2 text-center text-[15px] font-medium leading-snug transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-surface-soft',
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : rec ? (
              <div className="mt-5 grid gap-5 md:grid-cols-2 md:gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Вам подойдёт</p>
                  <p className="text-section-title mt-0.5 text-primary">{rec.city}</p>
                  <p className="mt-2 text-[15px] leading-relaxed">{typo(rec.reason)}</p>
                  <Link to={catalogHref} className={btnClass('secondary', { className: 'mt-4 w-full whitespace-normal text-center sm:w-auto' })}>
                    Смотреть новостройки {CITY_GENITIVE[rec.city]}
                    <ArrowRight aria-hidden />
                  </Link>
                </div>
                <div>
                  <p className="text-sm font-semibold">Пришлём подборку по городу</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {typo('Менеджер перезвонит и расскажет о районах и ценах.')}
                  </p>
                  <LeadForm
                    embedded
                    title=""
                    className="mt-3"
                    source="Квиз: подбор города"
                    requestType="SELECTION"
                    contextFooter={`Квиз: ${quizSummary(answers, rec)}`}
                    submitLabel="Получить подборку"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CityQuiz;
