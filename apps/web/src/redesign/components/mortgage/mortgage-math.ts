/**
 * Чистая математика ипотечного калькулятора: аннуитетный платёж, сумма кредита, переплата.
 * Расчёт ориентировочный — точные условия всегда подтверждает банк.
 */

export type MortgageInput = {
  /** Стоимость квартиры, ₽ */
  price: number;
  /** Первоначальный взнос, ₽ */
  downPayment: number;
  /** Срок, лет */
  years: number;
  /** Годовая ставка, % */
  ratePct: number;
};

export type MortgageResult = {
  loanAmount: number;
  monthlyPayment: number;
  totalPaid: number;
  overpayment: number;
};

const ZERO: MortgageResult = { loanAmount: 0, monthlyPayment: 0, totalPaid: 0, overpayment: 0 };

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/** Ежемесячный аннуитетный платёж: P · r(1+r)^n / ((1+r)^n − 1); при нулевой ставке — P / n. */
export function annuityPayment(loanAmount: number, ratePct: number, months: number): number {
  if (!(loanAmount > 0) || !(months > 0)) return 0;
  const r = finite(ratePct) / 100 / 12;
  if (r <= 0) return loanAmount / months;
  const k = Math.pow(1 + r, months);
  return (loanAmount * r * k) / (k - 1);
}

export function calcMortgage(input: MortgageInput): MortgageResult {
  const price = Math.max(0, finite(input.price));
  const down = Math.max(0, finite(input.downPayment));
  const loanAmount = Math.max(0, price - down);
  const months = Math.round(Math.max(0, finite(input.years)) * 12);
  if (loanAmount <= 0 || months <= 0) return { ...ZERO };
  const monthlyPayment = annuityPayment(loanAmount, input.ratePct, months);
  const totalPaid = monthlyPayment * months;
  return { loanAmount, monthlyPayment, totalPaid, overpayment: Math.max(0, totalPaid - loanAmount) };
}

/** «12 345 678 ₽» — пробелы-разделители разрядов как в ru-RU (неразрывные). */
export function formatRub(amount: number): string {
  return `${Math.round(finite(amount)).toLocaleString('ru-RU')}\u00a0₽`;
}

export type MortgageProgram = { name: string; rate: number; note?: string };
export type MortgageBank = { name: string; rate: number };

export const DEFAULT_MORTGAGE_PROGRAMS: MortgageProgram[] = [
  { name: 'Семейная', rate: 6, note: 'для семей с детьми' },
  { name: 'IT-ипотека', rate: 6, note: 'для сотрудников IT-компаний' },
  { name: 'Базовая', rate: 20, note: 'рыночная ставка, уточняйте' },
];

function parseRateList(raw: string | undefined): { name: string; rate: number; note?: string }[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: { name: string; rate: number; note?: string }[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const { name, rate, note } = row as Record<string, unknown>;
      const rateNum = typeof rate === 'string' ? Number(rate.replace(',', '.')) : rate;
      if (typeof name !== 'string' || !name.trim()) continue;
      if (typeof rateNum !== 'number' || !Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) continue;
      out.push({ name: name.trim(), rate: rateNum, ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Программы из настройки `mortgage_programs_json`; пусто или битый JSON — программы по умолчанию. */
export function parseMortgagePrograms(raw: string | undefined): MortgageProgram[] {
  const list = parseRateList(raw);
  return list.length > 0 ? list : DEFAULT_MORTGAGE_PROGRAMS;
}

/** Банки из `mortgage_banks_json`; пусто — пустой список (ставки банков не выдумываем). */
export function parseMortgageBanks(raw: string | undefined): MortgageBank[] {
  return parseRateList(raw).map(({ name, rate }) => ({ name, rate }));
}

/** Ставка для показа: «5,9 %» */
export function formatRate(rate: number): string {
  return `${rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}\u00a0%`;
}
