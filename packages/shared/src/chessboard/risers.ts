import type { ChessboardApartmentInput } from './types.js';

/**
 * Детерминированные стояки шахматки — по данным застройщика, без эвристик.
 *
 * 1. Позиция в имени файла планировки. У ССК и похожих выгрузок планировка называется
 *    `krylova_l15_s1_p4_f2-9_n02.png`: `s`/`p`/`k` — секция/подъезд/корпус, `n02` — номер окна
 *    на этаже. Одна и та же квартира на всех этажах получает один столбец.
 * 2. Номер квартиры «этаж + порядковый» (1001…1021 на 1 этаже, 6001… на 6-м): столбец = порядковый.
 *
 * Если ни одна схема не подходит надёжно, возвращаем null — тогда работает общий алгоритм
 * (topology.ts), который сопоставляет квартиры соседних этажей по площади и планировке.
 */

export type RiserColumn = {
  key: string;
  /** Группа столбцов (секция/подъезд) — между группами в сетке рисуется зазор. */
  group: string | null;
  /** Номер окна на этаже (для подписи столбца). */
  position: number;
};

export type RiserLayout = {
  floors: number[];
  columns: RiserColumn[];
  /** columns[colIdx][floorRowIdx] */
  cells: Array<Array<ChessboardApartmentInput | null>>;
  strategy: 'plan-position' | 'number-suffix' | 'number-rank';
};

const COVERAGE = 0.85;

type Keyed = { apt: ChessboardApartmentInput; group: string | null; position: number };

/** `…/krylova_l15_s1_p4_f2-9_n02.png` → { group: 's1·p4', position: 2 } */
export function parsePlanPosition(url: string | null | undefined): { group: string | null; position: number } | null {
  if (!url) return null;
  const base = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');
  // Второй формат (ССК, Резиденция морей): room-layout_…_sectionД1_…_room-number08_…
  const alt = base.match(/room-number(\d{1,3})/i);
  if (alt) {
    const position = parseInt(alt[1], 10);
    const sec = base.match(/section([^_.]+)/i)?.[1];
    return position > 0 ? { group: sec ? `s${sec}` : null, position } : null;
  }
  const m = base.match(/_n(\d{1,3})\.[a-z0-9]+$/i);
  if (!m) return null;
  const position = parseInt(m[1], 10);
  if (!Number.isFinite(position) || position <= 0) return null;
  // Первая часть — код проекта, вторая — литер (дом уже выбран), дальше корпус/секция/подъезд.
  const parts = base.replace(/\.[a-z0-9]+$/i, '').split('_').slice(2);
  const group = parts.filter((p) => /^[ksp].+/i.test(p) && !/^f/i.test(p)).join('·');
  return { group: group || null, position };
}

function numberSuffix(apt: ChessboardApartmentInput): number | null {
  const num = (apt.number ?? '').trim();
  const floor = String(apt.floor);
  if (!/^\d+$/.test(num) || !num.startsWith(floor)) return null;
  const rest = num.slice(floor.length);
  if (rest.length < 2 || rest.length > 3) return null;
  const n = parseInt(rest, 10);
  return n > 0 ? n : null;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

function build(keyed: Keyed[], rest: ChessboardApartmentInput[], strategy: RiserLayout['strategy']): RiserLayout | null {
  // Позиция на этаже должна быть уникальной, иначе схема ненадёжна
  const seen = new Set<string>();
  let clashes = 0;
  for (const k of keyed) {
    const id = `${k.apt.floor}|${k.group ?? ''}|${k.position}`;
    if (seen.has(id)) clashes += 1;
    seen.add(id);
  }
  if (clashes > Math.max(1, keyed.length * 0.02)) return null;

  const colMap = new Map<string, RiserColumn>();
  for (const k of keyed) {
    const key = `${k.group ?? ''}|${k.position}`;
    if (!colMap.has(key)) colMap.set(key, { key, group: k.group, position: k.position });
  }
  // Окна, которых нет в выгрузке (проданы раньше или сняты), — пустые столбцы 1…max внутри секции,
  // чтобы дом выглядел целым, а не «дырявым».
  if (strategy === 'plan-position') {
    const maxByGroup = new Map<string | null, number>();
    for (const c of colMap.values()) maxByGroup.set(c.group, Math.max(maxByGroup.get(c.group) ?? 0, c.position));
    const realByGroup = new Map<string | null, number>();
    for (const c of colMap.values()) realByGroup.set(c.group, (realByGroup.get(c.group) ?? 0) + 1);
    for (const [group, max] of maxByGroup) {
      const real = realByGroup.get(group) ?? 0;
      // Секция почти пустая (продано/не выгружено больше половины окон) — пустых окон не рисуем,
      // иначе сетка раздувается пустыми столбцами
      if (max > 30 || max - real > Math.max(1, real * 0.5)) continue;
      for (let pos = 1; pos <= max; pos++) {
        const key = `${group ?? ''}|${pos}`;
        if (!colMap.has(key)) colMap.set(key, { key, group, position: pos });
      }
    }
  }
  simplifyGroups([...colMap.values()]);
  const columns = [...colMap.values()].sort(
    (a, b) => naturalCompare(a.group ?? '', b.group ?? '') || a.position - b.position,
  );
  const all = [...keyed.map((k) => k.apt), ...rest];
  const floors = [...new Set(all.map((a) => a.floor))].sort((a, b) => b - a);
  const rowOf = new Map(floors.map((f, i) => [f, i]));
  const colOf = new Map(columns.map((c, i) => [c.key, i]));
  const cells: Array<Array<ChessboardApartmentInput | null>> = columns.map(() => floors.map(() => null));

  for (const k of keyed) {
    const c = colOf.get(`${k.group ?? ''}|${k.position}`)!;
    const r = rowOf.get(k.apt.floor)!;
    if (!cells[c][r]) cells[c][r] = k.apt;
    else rest.push(k.apt);
  }

  // Остальные (без позиции, например проданные без планировки) — в свободное окно стояка
  // с той же комнатностью и площадью, иначе в первое свободное окно этажа, иначе новый столбец.
  const fp = (a: ChessboardApartmentInput) => `${a.rooms}|${Math.round(a.area)}`;
  const colPrint = columns.map((_, c) => {
    const counts = new Map<string, number>();
    for (const a of cells[c]) if (a) counts.set(fp(a), (counts.get(fp(a)) ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  });
  for (const a of rest) {
    const r = rowOf.get(a.floor)!;
    let c = colPrint.findIndex((p, i) => p === fp(a) && !cells[i][r]);
    if (c < 0) c = cells.findIndex((col) => !col[r]);
    if (c < 0) {
      columns.push({ key: `extra-${columns.length}`, group: null, position: columns.length + 1 });
      cells.push(floors.map(() => null));
      colPrint.push(fp(a));
      c = cells.length - 1;
    }
    cells[c][r] = a;
  }

  // Пустые столбцы убираем, кроме окон-заполнителей секции (они показывают «нет в продаже»)
  const keep = columns.map((col, c) => cells[c].some(Boolean) || (strategy === 'plan-position' && !col.key.startsWith('extra-')));
  return {
    floors,
    columns: columns.filter((_, c) => keep[c]),
    cells: cells.filter((_, c) => keep[c]),
    strategy,
  };
}

/**
 * Подъезд (p) у большинства выгрузок дублирует секцию (s1_p1, s2_p2) — тогда в подписи он лишний.
 * Если в одной секции несколько подъездов, подъезд оставляем.
 */
function simplifyGroups(cols: RiserColumn[]): void {
  const withoutP = (g: string) => g.split('·').filter((x) => !/^p/i.test(x)).join('·');
  const podsBySection = new Map<string, Set<string>>();
  for (const c of cols) {
    if (!c.group) continue;
    const base = withoutP(c.group);
    const set = podsBySection.get(base) ?? new Set<string>();
    set.add(c.group);
    podsBySection.set(base, set);
  }
  const redundant = [...podsBySection.entries()].every(([base, set]) => base && set.size === 1);
  if (!redundant) return;
  for (const c of cols) if (c.group) c.group = withoutP(c.group);
}

export function buildDeterministicRisers(apartments: ChessboardApartmentInput[]): RiserLayout | null {
  const valid = apartments.filter((a) => a.floor != null && a.floor > 0 && a.floor <= 200);
  if (valid.length < 2) return null;

  const byPlan: Keyed[] = [];
  const noPlan: ChessboardApartmentInput[] = [];
  for (const apt of valid) {
    const p = parsePlanPosition(apt.planImage);
    if (p) byPlan.push({ apt, group: p.group, position: p.position });
    else noPlan.push(apt);
  }
  if (byPlan.length >= valid.length * COVERAGE) {
    const res = build(byPlan, noPlan, 'plan-position');
    if (res) return res;
  }

  const byNum: Keyed[] = [];
  const noNum: ChessboardApartmentInput[] = [];
  for (const apt of valid) {
    const n = numberSuffix(apt);
    if (n != null) byNum.push({ apt, group: null, position: n });
    else noNum.push(apt);
  }
  if (byNum.length >= valid.length * COVERAGE) {
    // Защита от сдвигающейся нумерации: столбцов не намного больше, чем квартир на самом полном этаже
    const perFloor = new Map<number, number>();
    for (const k of byNum) perFloor.set(k.apt.floor, (perFloor.get(k.apt.floor) ?? 0) + 1);
    const maxPerFloor = Math.max(...perFloor.values());
    const positions = byNum.map((k) => k.position);
    const distinct = new Set(positions).size;
    const maxPos = Math.max(...positions);
    // Номер окна должен быть «порядковым на этаже»: позиции укладываются в 1…maxPos, и maxPos разумный.
    // Проданных окон в выгрузке нет, поэтому сравниваем не с числом квартир на этаже, а с maxPos.
    if (distinct <= Math.ceil(maxPerFloor * 1.3) || (maxPos <= 60 && distinct <= maxPos)) {
      const res = build(byNum, noNum, 'number-suffix');
      if (res) return res;
    }
  }
  // 3. Номера есть, но без схемы «этаж + порядковый» (сквозная нумерация по дому, сдвиги по этажам):
  // столбец = порядок номера на этаже. Стояки могут не совпасть идеально, зато сетка ровная и
  // читается слева направо, как нумерация у застройщика.
  const numeric = valid.filter((a) => /^\d+$/.test((a.number ?? '').trim()));
  if (numeric.length >= valid.length * COVERAGE) {
    const byFloor = new Map<number, ChessboardApartmentInput[]>();
    for (const a of numeric) byFloor.set(a.floor, [...(byFloor.get(a.floor) ?? []), a]);
    const ranked: Keyed[] = [];
    for (const list of byFloor.values()) {
      list.sort((x, y) => Number(x.number) - Number(y.number));
      list.forEach((apt, i) => ranked.push({ apt, group: null, position: i + 1 }));
    }
    const rest = valid.filter((a) => !/^\d+$/.test((a.number ?? '').trim()));
    const res = build(ranked, rest, 'number-rank');
    if (res) return res;
  }
  return null;
}
