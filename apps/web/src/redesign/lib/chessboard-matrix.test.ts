import { describe, expect, it } from 'vitest';
import { buildShaftMatrix, matchScore } from './chessboard-matrix';
import type { Apartment } from '@/redesign/data/types';

function apt(partial: Partial<Apartment> & Pick<Apartment, 'id' | 'floor'>): Apartment {
  return {
    complexId: 'c1',
    buildingId: 'b1',
    rooms: 2,
    area: 50,
    kitchenArea: 10,
    totalFloors: 34,
    price: 10_000_000,
    pricePerMeter: 200_000,
    finishing: 'чистовая',
    status: 'available',
    planImage: '',
    section: 1,
    ...partial,
  } as Apartment;
}

describe('chessboard-matrix', () => {
  it('prefers low score for same layout on adjacent floors', () => {
    const a = apt({ id: '1', floor: 1, rooms: 3, area: 93.2 });
    const b = apt({ id: '2', floor: 1, rooms: 3, area: 93.3 });
    const c = apt({ id: '3', floor: 1, rooms: 2, area: 49 });
    expect(matchScore(a, b)).toBeLessThan(matchScore(a, c));
  });

  // Движок v4 (packages/shared, topology.ts) связывает стояк только через соседние этажи —
  // тест приведён к той же спецификации, что и src/chessboard/matrix.test.ts в shared:
  // одинаковая планировка на 34, 33 и 31 этажах (32-й пустой) — один столбец.
  it('aligns repeating layouts in the same shaft column', () => {
    const plan93 = 'https://cdn.example/plan-93.png';
    const matrix = buildShaftMatrix([
      apt({ id: 'top', floor: 34, number: '326', rooms: 3, area: 93.2, planImage: plan93 }),
      apt({ id: 'bridge-33', floor: 33, number: '318', rooms: 3, area: 93.2, planImage: plan93 }),
      apt({ id: 'mid-4e', floor: 33, number: '319', rooms: 4, area: 93.9, planImage: 'https://cdn.example/plan-94.png' }),
      apt({ id: 'mid-2e', floor: 33, number: '322', rooms: 2, area: 49.3, planImage: 'https://cdn.example/plan-49.png' }),
      apt({ id: 'low-3e', floor: 31, number: '302', rooms: 3, area: 93.2, planImage: plan93 }),
      apt({ id: 'low-2e', floor: 31, number: '304', rooms: 2, area: 47.4, planImage: 'https://cdn.example/plan-47.png' }),
    ]);

    expect(matrix.floors).toEqual([34, 33, 32, 31]);
    expect(matrix.columns.length).toBeGreaterThanOrEqual(2);

    const colWithTop = matrix.columns.find((col) => col[0]?.id === 'top');
    expect(colWithTop).toBeDefined();
    expect(colWithTop?.[1]?.id).toBe('bridge-33');
    expect(colWithTop?.[2]).toBeNull();
    expect(colWithTop?.[3]?.id).toBe('low-3e');
  });

  it('preserves empty slots for missing apartments on a floor', () => {
    const matrix = buildShaftMatrix([
      apt({ id: 'a', floor: 2, number: '201', rooms: 1, area: 40 }),
      apt({ id: 'b', floor: 1, number: '101', rooms: 1, area: 40 }),
      apt({ id: 'c', floor: 1, number: '102', rooms: 2, area: 55 }),
    ]);

    expect(matrix.floors).toEqual([2, 1]);
    const rowFloor1 = matrix.columns.map((col) => col[1]);
    expect(rowFloor1.filter(Boolean)).toHaveLength(2);
    const rowFloor2 = matrix.columns.map((col) => col[0]);
    expect(rowFloor2.filter(Boolean)).toHaveLength(1);
    expect(rowFloor2.some((c) => c === null)).toBe(true);
  });

  it('includes intermediate empty floors in range', () => {
    const matrix = buildShaftMatrix([
      apt({ id: 'a', floor: 5, number: '501' }),
      apt({ id: 'b', floor: 3, number: '301' }),
    ]);
    expect(matrix.floors).toEqual([5, 4, 3]);
    expect(matrix.columns[0][1]).toBeNull();
  });
});
