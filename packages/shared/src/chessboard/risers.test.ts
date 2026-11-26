import { describe, expect, it } from 'vitest';
import { buildDeterministicRisers, parsePlanPosition } from './risers.js';
import { buildChessboardBuildingMatrix, riserGroupLabel } from './build-grid.js';
import type { ChessboardApartmentInput } from './types.js';

const plan = (n: number, s = 's1_p4') => `https://bx.sskuban.ru/upload/planers/p/Krylova_l15_${s}_f2-9_n0${n}.png`;
const apt = (id: string, floor: number, n: number, extra: Partial<ChessboardApartmentInput> = {}): ChessboardApartmentInput => ({
  id, floor, rooms: n === 2 ? 1 : 2, area: 40 + n, price: 1e7, status: 'available', planImage: plan(n), ...extra,
});

describe('parsePlanPosition', () => {
  it('читает номер окна и секцию', () => {
    expect(parsePlanPosition(plan(2))).toEqual({ group: 's1·p4', position: 2 });
    expect(parsePlanPosition('x/fnt_l19_p3_f4-18_n05.png')).toEqual({ group: 'p3', position: 5 });
    expect(parsePlanPosition('x/mgr_l1_k1_s1_p1_f3-9_n20.png')).toEqual({ group: 'k1·s1·p1', position: 20 });
    expect(parsePlanPosition('x/preset/2093/6af6e583ae865.png')).toBeNull();
  });
  it('подпись группы', () => {
    expect(riserGroupLabel('k1·s2')).toBe('Корпус 1 · секция 2');
    expect(riserGroupLabel('p3')).toBe('Подъезд 3');
  });
});

describe('buildDeterministicRisers', () => {
  it('одна планировка — один столбец на всех этажах, даже если на этаже не хватает квартир', () => {
    const apts: ChessboardApartmentInput[] = [];
    for (let f = 2; f <= 12; f++) for (let n = 1; n <= 7; n++) if (!(n === 2 && f % 3 === 0)) apts.push(apt(`${f}-${n}`, f, n));
    const r = buildDeterministicRisers(apts)!;
    expect(r.strategy).toBe('plan-position');
    expect(r.columns.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const col2 = r.cells[1].filter(Boolean).map((a) => a!.id.split('-')[1]);
    expect(new Set(col2)).toEqual(new Set(['2']));
  });

  it('номер «этаж + порядковый»', () => {
    const apts = [1, 2, 3].flatMap((f) => [1, 2, 3].map((n) => apt(`${f}${n}`, f, n, { planImage: null, number: `${f}00${n}` })));
    const r = buildDeterministicRisers(apts)!;
    expect(r.strategy).toBe('number-suffix');
    expect(r.cells[2].map((a) => a?.number)).toEqual(['3003', '2003', '1003']);
  });

  it('без схемы — null (работает общий алгоритм)', () => {
    const apts = [1, 2].flatMap((f) => [1, 2].map((n) => apt(`${f}${n}`, f, n, { planImage: null, number: `${n + f * 7}` })));
    expect(buildDeterministicRisers(apts)).toBeNull();
    expect(buildChessboardBuildingMatrix('1', 'Дом', apts).grid.length).toBe(2);
  });

  it('секции дома идут группами', () => {
    const apts = [2, 3].flatMap((f) => [
      apt(`a${f}`, f, 1, { planImage: plan(1, 's3_p3') }),
      apt(`b${f}`, f, 1, { planImage: plan(1, 's5_p5') }),
    ]);
    const m = buildChessboardBuildingMatrix('1', 'Дом', apts);
    expect(m.shafts.map((s) => s.group)).toEqual(['Секция 3', 'Секция 5']);
  });
});
