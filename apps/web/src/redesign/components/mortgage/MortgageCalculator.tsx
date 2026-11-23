import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { settingOptional, useSiteSettings } from '@/redesign/hooks/useSiteSettings';
import { typo } from '@/shared/lib/typography';
import {
  calcMortgage,
  formatRate,
  formatRub,
  parseMortgageBanks,
  parseMortgagePrograms,
} from '@/redesign/components/mortgage/mortgage-math';

type Props = {
  /** Цена квартиры, ₽ — например со страницы объекта. Без неё — типовая цена новостройки. */
  price?: number;
  /** Узкая версия для боковых колонок: всё в одну колонку, без списка банков. */
  compact?: boolean;
  title?: string;
  /**
   * Кнопка «Подобрать ипотеку»; без обработчика кнопку не рисуем.
   * Аргумент — параметры расчёта одной строкой, для комментария к заявке.
   */
  onLead?: (summary: string) => void;
  className?: string;
};

const DEFAULT_PRICE = 6_000_000;
const MAX_PRICE = 500_000_000;
const MAX_DOWN_PCT = 90;
const DEFAULT_DOWN_PCT = 20;
const DEFAULT_YEARS = 20;

export const MORTGAGE_DISCLAIMER =
  'Расчёт предварительный, не является офертой. Точную ставку и условия подтвердит банк.';

const digitsOnly = (s: string) => Number(s.replace(/\D/g, '').slice(0, 12) || '0');
const groupDigits = (n: number) => (n > 0 ? Math.round(n).toLocaleString('ru-RU') : '');

function yearsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'год';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'года';
  return 'лет';
}

const inputClass =
  'h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base font-semibold tabular-nums text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus/40';

const chipClass = (active: boolean) =>
  cn(
    'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-surface-soft',
  );

function Field({ label, htmlFor, aside, children }: { label: string; htmlFor: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * Ипотечный калькулятор: стоимость, взнос (% и ₽), срок, ставка; программы и банки — из
 * настроек сайта (`mortgage_programs_json`, `mortgage_banks_json`). Ставки банков не выдумываем:
 * нет настройки — нет и списка банков.
 */
const MortgageCalculator = ({ price, compact = false, title = 'Ипотечный калькулятор', onLead, className }: Props) => {
  const uid = useId();
  const { data: settings } = useSiteSettings();
  const programs = useMemo(() => parseMortgagePrograms(settingOptional(settings, 'mortgage_programs_json')), [settings]);
  const banks = useMemo(() => parseMortgageBanks(settingOptional(settings, 'mortgage_banks_json')), [settings]);

  const [priceRub, setPriceRub] = useState(() => (price && price > 0 ? Math.round(price) : DEFAULT_PRICE));
  const [downPct, setDownPct] = useState(DEFAULT_DOWN_PCT);
  const [years, setYears] = useState(DEFAULT_YEARS);
  /** Ставка строкой: пользователь может набирать «5,» — число разбираем отдельно */
  const [rateText, setRateText] = useState(() => String(programs[0]?.rate ?? 6).replace('.', ','));
  /** Какая программа или банк выбраны чипом; ручная правка ставки снимает выбор */
  const [picked, setPicked] = useState<string | null>(() => (programs[0] ? `p:${programs[0].name}` : null));

  // Цена объекта пришла позже (данные догрузились) — подставляем её
  useEffect(() => {
    if (price && price > 0) setPriceRub(Math.round(price));
  }, [price]);

  // Программы из настроек пришли после первого рендера — берём первую, пока ставку не трогали
  const rateTouched = useRef(false);
  const firstProgram = programs[0];
  useEffect(() => {
    if (rateTouched.current || !firstProgram) return;
    setPicked(`p:${firstProgram.name}`);
    setRateText(String(firstProgram.rate).replace('.', ','));
  }, [firstProgram]);

  const rate = useMemo(() => {
    const n = Number(rateText.replace(',', '.'));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
  }, [rateText]);

  const downRub = Math.round((priceRub * downPct) / 100);
  const result = calcMortgage({ price: priceRub, downPayment: downRub, years, ratePct: rate });

  const pickedLabel = picked ? picked.slice(2) : null;
  const leadSummary = [
    `Калькулятор: цена ${formatRub(priceRub)}`,
    `взнос ${Math.round(downPct)} % (${formatRub(downRub)})`,
    `срок ${years} ${yearsWord(years)}`,
    `ставка ${formatRate(rate)}${pickedLabel ? ` (${pickedLabel})` : ''}`,
    result.loanAmount > 0 ? `платёж ${formatRub(result.monthlyPayment)}/мес` : 'без кредита',
  ].join(', ');

  const pickRate = (key: string, value: number) => {
    rateTouched.current = true;
    setPicked(key);
    setRateText(String(value).replace('.', ','));
  };

  const ids = {
    price: `${uid}-price`,
    downPct: `${uid}-down-pct`,
    downRub: `${uid}-down-rub`,
    years: `${uid}-years`,
    rate: `${uid}-rate`,
  };

  const inputs = (
    <div className="flex flex-col gap-5">
      <Field label="Стоимость квартиры, ₽" htmlFor={ids.price}>
        <input
          id={ids.price}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={inputClass}
          value={groupDigits(priceRub)}
          placeholder="6 000 000"
          onChange={(e) => setPriceRub(Math.min(digitsOnly(e.target.value), MAX_PRICE))}
        />
      </Field>

      <Field
        label="Первоначальный взнос"
        htmlFor={ids.downRub}
        aside={<span className="text-sm font-semibold tabular-nums text-foreground">{Math.round(downPct)}&nbsp;%</span>}
      >
        <input
          id={ids.downRub}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={ids.downPct}
          className={inputClass}
          value={groupDigits(downRub) || '0'}
          onChange={(e) => {
            const rub = digitsOnly(e.target.value);
            setDownPct(priceRub > 0 ? Math.min((rub / priceRub) * 100, MAX_DOWN_PCT) : 0);
          }}
        />
        <input
          id={ids.downPct}
          type="range"
          min={0}
          max={MAX_DOWN_PCT}
          step={1}
          value={Math.round(downPct)}
          aria-label="Первоначальный взнос, процентов"
          aria-valuetext={`${Math.round(downPct)} %`}
          onChange={(e) => setDownPct(Number(e.target.value))}
          className="mt-3 h-6 w-full cursor-pointer accent-primary"
        />
      </Field>

      <div className={cn('grid gap-5', !compact && 'sm:grid-cols-2')}>
        <Field
          label="Срок"
          htmlFor={ids.years}
          aside={
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {years}&nbsp;{yearsWord(years)}
            </span>
          }
        >
          <input
            id={ids.years}
            type="range"
            min={1}
            max={30}
            step={1}
            value={years}
            aria-valuetext={`${years} ${yearsWord(years)}`}
            onChange={(e) => setYears(Number(e.target.value))}
            className="h-12 w-full cursor-pointer accent-primary"
          />
        </Field>

        <Field label="Ставка, % годовых" htmlFor={ids.rate}>
          <input
            id={ids.rate}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={inputClass}
            value={rateText}
            onChange={(e) => {
              rateTouched.current = true;
              setPicked(null);
              setRateText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5));
            }}
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground" id={`${uid}-programs`}>
          Программа
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${uid}-programs`}>
          {programs.map((p) => {
            const active = picked === `p:${p.name}`;
            return (
              <button
                key={p.name}
                type="button"
                aria-pressed={active}
                title={p.note}
                onClick={() => pickRate(`p:${p.name}`, p.rate)}
                className={chipClass(active)}
              >
                {p.name}
                <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {formatRate(p.rate)}
                </span>
              </button>
            );
          })}
        </div>
        {(() => {
          const note = programs.find((p) => picked === `p:${p.name}`)?.note;
          return note ? <p className="mt-2 text-xs text-muted-foreground">{typo(note)}</p> : null;
        })()}
      </div>

      {banks.length > 0 && !compact ? (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground" id={`${uid}-banks`}>
            Ставки банков — нажмите на банк, подставим ставку
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${uid}-banks`}>
            {banks.map((b) => {
              const active = picked === `b:${b.name}`;
              return (
                <button
                  key={b.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickRate(`b:${b.name}`, b.rate)}
                  className={chipClass(active)}
                >
                  {b.name}
                  <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    от {formatRate(b.rate)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );

  const summary = (
    <div className="flex flex-col rounded-2xl bg-surface-soft p-4 sm:p-5" aria-live="polite">
      <p className="text-sm text-muted-foreground">Ежемесячный платёж</p>
      <p className="text-price mt-1 text-[28px] leading-tight text-foreground sm:text-[32px]">
        {result.loanAmount > 0 ? formatRub(result.monthlyPayment) : '—'}
      </p>
      {result.loanAmount <= 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Взнос покрывает стоимость — кредит не нужен.</p>
      ) : null}

      <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Сумма кредита</dt>
          <dd className="font-semibold tabular-nums">{formatRub(result.loanAmount)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Переплата</dt>
          <dd className="font-semibold tabular-nums">{formatRub(result.overpayment)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Ставка</dt>
          <dd className="font-semibold tabular-nums">{formatRate(rate)}</dd>
        </div>
      </dl>

      {onLead ? (
        <Button type="button" onClick={() => onLead(leadSummary)} className="mt-5 w-full">
          Подобрать ипотеку
        </Button>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{typo(MORTGAGE_DISCLAIMER)}</p>
    </div>
  );

  return (
    <section
      className={cn('rounded-2xl border border-border bg-card p-4 sm:p-6', className)}
      aria-labelledby={`${uid}-title`}
    >
      <h2 id={`${uid}-title`} className={cn('font-semibold', compact ? 'text-lg' : 'text-title')}>
        {title}
      </h2>
      <div
        className={cn(
          'mt-4 grid gap-5 sm:mt-5',
          !compact && 'lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start lg:gap-8',
        )}
      >
        {inputs}
        <div className={cn(!compact && 'lg:sticky lg:top-24')}>{summary}</div>
      </div>
    </section>
  );
};

export default MortgageCalculator;
