import { describe, expect, it } from 'vitest';
import {
  annuityPayment,
  calcMortgage,
  DEFAULT_MORTGAGE_PROGRAMS,
  formatRub,
  parseMortgageBanks,
  parseMortgagePrograms,
} from './mortgage-math';

describe('annuityPayment', () => {
  it('считает аннуитет по классической формуле', () => {
    // 1 000 000 ₽ на 12 мес. под 12 % годовых → 88 848,79 ₽
    expect(annuityPayment(1_000_000, 12, 12)).toBeCloseTo(88_848.79, 1);
  });

  it('при нулевой ставке делит долг поровну', () => {
    expect(annuityPayment(1_200_000, 0, 120)).toBe(10_000);
  });

  it('без долга или срока — ноль', () => {
    expect(annuityPayment(0, 6, 120)).toBe(0);
    expect(annuityPayment(1_000_000, 6, 0)).toBe(0);
  });
});

describe('calcMortgage', () => {
  it('сумма кредита, платёж и переплата', () => {
    const r = calcMortgage({ price: 6_000_000, downPayment: 1_200_000, years: 20, ratePct: 6 });
    expect(r.loanAmount).toBe(4_800_000);
    expect(r.monthlyPayment).toBeCloseTo(34_388.69, 1);
    expect(r.overpayment).toBeCloseTo(r.monthlyPayment * 240 - 4_800_000, 5);
  });

  it('ставка 0 — переплаты нет', () => {
    const r = calcMortgage({ price: 3_000_000, downPayment: 600_000, years: 10, ratePct: 0 });
    expect(r.monthlyPayment).toBe(20_000);
    expect(r.overpayment).toBe(0);
  });

  it('взнос не меньше цены — кредит не нужен', () => {
    expect(calcMortgage({ price: 5_000_000, downPayment: 5_000_000, years: 20, ratePct: 6 })).toEqual({
      loanAmount: 0,
      monthlyPayment: 0,
      totalPaid: 0,
      overpayment: 0,
    });
    expect(calcMortgage({ price: 5_000_000, downPayment: 7_000_000, years: 20, ratePct: 6 }).loanAmount).toBe(0);
  });
});

describe('настройки программ и банков', () => {
  it('битый или пустой JSON — программы по умолчанию', () => {
    expect(parseMortgagePrograms(undefined)).toBe(DEFAULT_MORTGAGE_PROGRAMS);
    expect(parseMortgagePrograms('{oops')).toBe(DEFAULT_MORTGAGE_PROGRAMS);
    expect(parseMortgagePrograms('[]')).toBe(DEFAULT_MORTGAGE_PROGRAMS);
  });

  it('читает программы из настройки, пропуская кривые строки', () => {
    const list = parseMortgagePrograms('[{"name":"Семейная","rate":6,"note":"для семей"},{"name":"","rate":3},{"name":"Х","rate":"x"}]');
    expect(list).toEqual([{ name: 'Семейная', rate: 6, note: 'для семей' }]);
  });

  it('банки без настройки не выдумываем', () => {
    expect(parseMortgageBanks(undefined)).toEqual([]);
    expect(parseMortgageBanks('[{"name":"Сбер","rate":"5,9"}]')).toEqual([{ name: 'Сбер', rate: 5.9 }]);
  });

  it('формат рублей с разрядами', () => {
    expect(formatRub(1234567.4).replace(/\s/g, ' ')).toBe('1 234 567 ₽');
  });
});
