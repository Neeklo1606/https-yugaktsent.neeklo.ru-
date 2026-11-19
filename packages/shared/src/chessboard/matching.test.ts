import { describe, expect, it } from 'vitest';
import { minCostAssignment } from './matching.js';

describe('minCostAssignment', () => {
  it('picks minimum total cost pairing', () => {
    const cost = [
      [9, 2, 7],
      [6, 4, 3],
      [5, 8, 1],
    ];
    const assign = minCostAssignment(cost);
    const total =
      cost[0]![assign[0]!]! + cost[1]![assign[1]!]! + cost[2]![assign[2]!]!;
    expect(total).toBe(9);
    expect(assign[0]).toBe(1);
    expect(assign[1]).toBe(0);
    expect(assign[2]).toBe(2);
  });

  it('handles rectangular matrices via padding', () => {
    const cost = [
      [1, 10],
      [10, 1],
    ];
    const assign = minCostAssignment(cost);
    expect(assign[0]).toBe(0);
    expect(assign[1]).toBe(1);
  });
});

describe('minCostAssignment: этажи разной длины (зависание API 19.11.2026)', () => {
  it('завершается на прямоугольной матрице с запретными ячейками', () => {
    const rows = 22;
    const cols = 36;
    const cost = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => (Math.abs(i * 1.6 - j) < 2 ? Math.abs(i * 1.6 - j) : 1e6)),
    );
    const t = Date.now();
    const out = minCostAssignment(cost);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(out).toHaveLength(rows);
    const used = out.filter((j) => j >= 0);
    expect(new Set(used).size).toBe(used.length);
  });

  it('оптимум на малой матрице не изменился', () => {
    expect(minCostAssignment([[1, 5], [5, 1]])).toEqual([0, 1]);
    expect(minCostAssignment([[1e6, 2], [3, 1e6], [1, 1]])).toEqual([1, -1, 0]); // 2 + 1 = 3 < 2 + 3
  });
});
