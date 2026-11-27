import type { ChessboardApartmentCell, ChessboardBuildingMatrix } from '@/redesign/lib/chessboard-api';

/**
 * Вспомогательные функции шахматки «как у застройщика»: литеры и секции,
 * сплошная сетка этажей, подсчёт «свободно N из M», короткая цена в ячейке.
 */

export type ChessBuildingOption = { id: string; name: string; apartmentCount: number };

export type ChessBuildingGroup = {
  /** «Литер 1.1» */
  group: string;
  items: { id: string; label: string; apartmentCount: number }[];
};

const SECTION_RE = /^(.*?)[,\s]+((?:секция|подъезд|блок|корпус)\s*\S+)\s*$/i;

/** «Литер 1.1, секция 3» → { group: «Литер 1.1», section: «Секция 3» } */
export function splitBuildingName(name: string): { group: string; section: string | null } {
  let clean = name.replace(/^корп\.\s*/i, '').trim();
  // В выгрузках корпус часто называется просто «3» или «2.1» — подписываем явно
  if (/^[\d.,/-]+[а-яa-z]?$/i.test(clean)) clean = `Корпус ${clean}`;
  const m = clean.match(SECTION_RE);
  if (!m || !m[1].trim()) return { group: clean, section: null };
  const section = m[2].trim();
  return { group: m[1].trim(), section: section.charAt(0).toUpperCase() + section.slice(1) };
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Корпуса группируются по литеру; внутри — секции по порядку номеров */
export function groupChessBuildings(options: ChessBuildingOption[]): ChessBuildingGroup[] {
  const map = new Map<string, ChessBuildingGroup>();
  for (const o of options) {
    const { group, section } = splitBuildingName(o.name);
    const g = map.get(group) ?? { group, items: [] };
    g.items.push({ id: o.id, label: section ?? group, apartmentCount: o.apartmentCount });
    map.set(group, g);
  }
  const groups = [...map.values()].sort((a, b) => naturalCompare(a.group, b.group));
  for (const g of groups) g.items.sort((a, b) => naturalCompare(a.label, b.label));
  return groups;
}

export type ChessRow = {
  floor: number;
  cells: (ChessboardApartmentCell | null)[];
};

/**
 * Строки сетки сверху вниз без пропусков: если на этаже нет ни одной квартиры
 * в данных, он всё равно рисуется — пустыми окнами, как в шахматке застройщика.
 */
export function buildChessRows(matrix: ChessboardBuildingMatrix): ChessRow[] {
  const { floors, grid, shaftCount } = matrix;
  if (!floors.length || !shaftCount) return [];
  const byFloor = new Map<number, (ChessboardApartmentCell | null)[]>();
  floors.forEach((floor, i) => {
    const row = grid[i] ?? [];
    byFloor.set(
      floor,
      Array.from({ length: shaftCount }, (_, c) => row[c]?.apartment ?? null),
    );
  });
  const max = Math.max(...floors);
  const min = Math.min(...floors);
  const rows: ChessRow[] = [];
  for (let f = max; f >= min; f -= 1) {
    rows.push({ floor: f, cells: byFloor.get(f) ?? Array.from({ length: shaftCount }, () => null) });
  }
  return rows;
}

export type ChessCounts = {
  available: number;
  reserved: number;
  /** Проданные по данным застройщика + пустые окна (нет в продаже) */
  soldOrClosed: number;
  /** Только проданные по данным застройщика */
  sold: number;
  /** Окна, по которым у застройщика нет данных (сняты с продажи или проданы раньше выгрузки) */
  closed: number;
  total: number;
};

export function countChessCells(rows: ChessRow[], isOutside?: (floor: number, col: number) => boolean): ChessCounts {
  const c: ChessCounts = { available: 0, reserved: 0, soldOrClosed: 0, sold: 0, closed: 0, total: 0 };
  for (const r of rows) {
    for (const [i, cell] of r.cells.entries()) {
      if (!cell && isOutside?.(r.floor, i)) continue;
      c.total += 1;
      if (!cell) {
        c.closed += 1;
        c.soldOrClosed += 1;
      } else if (cell.status === 'sold') {
        c.sold += 1;
        c.soldOrClosed += 1;
      } else if (cell.status === 'reserved') c.reserved += 1;
      else c.available += 1;
    }
  }
  return c;
}

export type ChessColumn = {
  /** Номер стояка по порядку внутри секции: 1…N */
  label: string;
  /** Номер окна на этаже по данным застройщика (для подсказки) */
  origin: string;
  /** Подпись секции/подъезда, если дом в выгрузке разбит на секции */
  group: string | null;
  /** Первый столбец новой группы — перед ним рисуется зазор */
  groupStart: boolean;
};

/** Столбцы сетки с подписями и секциями. Группы показываем, только если их больше одной. */
export function buildChessColumns(matrix: ChessboardBuildingMatrix): ChessColumn[] {
  const shafts = matrix.shafts ?? [];
  const groups = new Set(shafts.map((s) => s.group ?? ''));
  const showGroups = groups.size > 1;
  let n = 0;
  return Array.from({ length: matrix.shaftCount }, (_, i) => {
    const s = shafts[i];
    const group = showGroups ? s?.group ?? null : null;
    const prev = i > 0 && showGroups ? shafts[i - 1]?.group ?? null : group;
    const groupStart = showGroups && i > 0 && prev !== group;
    // Внутри секции подписываем стояки по порядку: у застройщика номера окон бывают с пропусками (1, 3, 9…)
    if (i === 0 || groupStart || (s?.group ?? null) !== (shafts[i - 1]?.group ?? null)) n = 0;
    n += 1;
    return { label: String(n), origin: String(s?.position ?? i + 1), group, groupStart };
  });
}

/** Подряд идущие столбцы одной секции → { label, span } для строки заголовка */
export function chessColumnGroups(columns: ChessColumn[]): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (last && !c.groupStart && last.label === (c.group ?? '')) last.span += 1;
    else out.push({ label: c.group ?? '', span: 1 });
  }
  return out;
}

/** 9 540 000 → «9,54 млн»; 950 000 → «950 тыс.»; 0 → «» */
export function shortChessPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  if (price >= 1_000_000) {
    const v = price / 1_000_000;
    return `${v.toLocaleString('ru-RU', { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 })} млн`;
  }
  return `${Math.round(price / 1000).toLocaleString('ru-RU')} тыс.`;
}

/** Студия → «Ст», 2 → «2к» */
export function shortRooms(rooms: number): string {
  if (rooms === 0) return 'Ст';
  if (rooms > 0) return `${rooms}к`;
  return '';
}

/** ISO-дата срока сдачи → «2 кв. 2027» */
export function deadlineQuarter(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${Math.floor(d.getUTCMonth() / 3) + 1} кв. ${d.getUTCFullYear()}`;
}

export type ChessSection = {
  id: string;
  label: string;
  /** Индекс первого столбца секции в общей сетке литера */
  colStart: number;
  available: number;
  total: number;
  deadline: string | null;
  /** Число столбцов секции и её этажи — выше/ниже секции окна не рисуем */
  colCount: number;
  minFloor: number;
  maxFloor: number;
};

export type ChessLiteral = {
  group: string;
  /** Секция, которая откроется по клику на литер */
  firstId: string;
  available: number;
  total: number;
  deadline: string | null;
};

const freeOf = (m: ChessboardBuildingMatrix) => m.statusCounts.available + m.statusCounts.reserved;

/** Литеры ЖК со сроком сдачи и числом свободных квартир — для фильтра «Дом» */
export function chessLiterals(boards: ChessboardBuildingMatrix[]): ChessLiteral[] {
  const map = new Map<string, ChessLiteral & { deadlines: string[] }>();
  for (const b of boards) {
    const { group } = splitBuildingName(b.name);
    const cur = map.get(group) ?? { group, firstId: b.id, available: 0, total: 0, deadline: null, deadlines: [] };
    cur.available += freeOf(b);
    cur.total += b.apartmentCount;
    const dl = deadlineQuarter(b.deadline);
    if (dl && !cur.deadlines.includes(dl)) cur.deadlines.push(dl);
    map.set(group, cur);
  }
  const list = [...map.values()].map(({ deadlines, ...l }) => ({
    ...l,
    deadline: deadlines.length === 1 ? deadlines[0] : deadlines.length > 1 ? deadlines.sort()[0] : null,
  }));
  return list.sort((a, b) => naturalCompare(a.group, b.group));
}

/**
 * Весь литер одной сеткой, как у застройщика: секции рядом слева направо, у каждой своя подпись.
 * Если в литере одна секция — возвращаем её матрицу как есть.
 */
export function mergeLiteralMatrix(
  boards: ChessboardBuildingMatrix[],
  activeId: string | null,
): { matrix: ChessboardBuildingMatrix; group: string; sections: ChessSection[] } | null {
  if (!boards.length) return null;
  const active = boards.find((b) => b.id === activeId) ?? boards[0];
  const { group } = splitBuildingName(active.name);
  const members = boards
    .filter((b) => splitBuildingName(b.name).group === group)
    .sort((a, b) => naturalCompare(splitBuildingName(a.name).section ?? a.name, splitBuildingName(b.name).section ?? b.name));
  if (members.length === 1) {
    return {
      matrix: active,
      group,
      sections: [
        {
          id: active.id,
          label: splitBuildingName(active.name).section ?? group,
          colStart: 0,
          colCount: active.shaftCount,
          minFloor: Math.min(...active.floors),
          maxFloor: Math.max(...active.floors),
          available: freeOf(active),
          total: active.apartmentCount,
          deadline: deadlineQuarter(active.deadline),
        },
      ],
    };
  }
  const floors = [...new Set(members.flatMap((m) => m.floors))].sort((a, b) => b - a);
  const shafts: ChessboardBuildingMatrix['shafts'] = [];
  const sections: ChessSection[] = [];
  const cellsByFloor = new Map<number, ChessboardBuildingMatrix['grid'][number]>(floors.map((f) => [f, []]));
  const statusCounts = { available: 0, reserved: 0, sold: 0 };
  let apartmentCount = 0;
  for (const m of members) {
    const secLabel = splitBuildingName(m.name).section ?? m.name;
    const inner = new Set(m.shafts.map((s) => s.group ?? ''));
    sections.push({
      id: m.id,
      label: secLabel,
      colStart: shafts.length,
      colCount: m.shaftCount,
      minFloor: m.floors.length ? Math.min(...m.floors) : 0,
      maxFloor: m.floors.length ? Math.max(...m.floors) : 0,
      available: freeOf(m),
      total: m.apartmentCount,
      deadline: deadlineQuarter(m.deadline),
    });
    m.shafts.forEach((s) => {
      shafts.push({ ...s, group: inner.size > 1 && s.group ? `${secLabel} · ${s.group}` : secLabel, shaftIndex: shafts.length + 1 });
    });
    const rowOf = new Map(m.floors.map((f, i) => [f, i]));
    for (const f of floors) {
      const r = rowOf.get(f);
      const row = r === undefined ? [] : m.grid[r] ?? [];
      for (let c = 0; c < m.shaftCount; c++) {
        cellsByFloor.get(f)!.push({ floor: f, shaftIndex: 0, apartment: row[c]?.apartment ?? null });
      }
    }
    statusCounts.available += m.statusCounts.available;
    statusCounts.reserved += m.statusCounts.reserved;
    statusCounts.sold += m.statusCounts.sold;
    apartmentCount += m.apartmentCount;
  }
  const grid = floors.map((f) => cellsByFloor.get(f)!.map((cell, i) => ({ ...cell, shaftIndex: i + 1 })));
  const dls = sections.map((s) => s.deadline).filter(Boolean) as string[];
  return {
    group,
    sections,
    matrix: {
      ...active,
      id: `literal:${group}`,
      name: group,
      tabLabel: group,
      apartmentCount,
      statusCounts,
      floors,
      shaftCount: shafts.length,
      shafts,
      grid,
      columns: [],
      floorTemplates: [],
      deadline: dls.length ? members.find((m) => deadlineQuarter(m.deadline) === dls.sort()[0])?.deadline ?? null : null,
    },
  };
}

/** Цена за м² → корзина 0…4 внутри литера (подсветка «дешевле → дороже») */
export function pricePerMeterBuckets(rows: ChessRow[]): (ppm: number) => number | null {
  const vals = rows
    .flatMap((r) => r.cells)
    .filter((c): c is ChessboardApartmentCell => !!c && c.status !== 'sold' && c.price > 0 && c.area > 0)
    .map((c) => c.price / c.area)
    .sort((a, b) => a - b);
  if (vals.length < 5) return () => null;
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => vals[Math.floor(p * (vals.length - 1))]);
  return (ppm: number) => (ppm <= 0 ? null : q.filter((t) => ppm > t).length);
}

/**
 * Планировки ЖК по всем квартирам из шахматки (а не по первым 48 загруженным): одна карточка
 * на «комнатность + площадь» — одинаковые квартиры разных этажей и секций не дублируются.
 */
export function layoutGroupsFromChessboard(
  complexId: string,
  boards: ChessboardBuildingMatrix[],
): {
  id: string;
  complexId: string;
  apartmentId?: string;
  rooms: number;
  area: number;
  priceFrom: number;
  priceTo: number;
  planImage: string;
  availableCount: number;
}[] {
  const map = new Map<string, ReturnType<typeof layoutGroupsFromChessboard>[number]>();
  for (const b of boards)
    for (const row of b.grid)
      for (const cell of row) {
        const a = cell.apartment;
        if (!a || a.status === 'sold') continue;
        const key = `${a.rooms}|${Math.round(a.area * 10) / 10}`;
        const g =
          map.get(key) ??
          {
            id: key,
            complexId,
            apartmentId: a.id,
            rooms: a.rooms,
            area: a.area,
            priceFrom: 0,
            priceTo: 0,
            planImage: a.planImage ?? '',
            availableCount: 0,
          };
        g.availableCount += 1;
        if (!g.planImage && a.planImage) g.planImage = a.planImage;
        if (a.price > 0 && (g.priceFrom <= 0 || a.price < g.priceFrom)) {
          g.priceFrom = a.price;
          g.apartmentId = a.id;
          if (a.planImage) g.planImage = a.planImage;
        }
        if (a.price > g.priceTo) g.priceTo = a.price;
        map.set(key, g);
      }
  return [...map.values()].sort((x, y) => x.rooms - y.rooms || x.area - y.area);
}

/** Диапазон цен одним видом по всему сайту: «8,1–12,5 млн ₽» (до млн — «950 тыс. ₽») */
export function priceRangeShort(lo: number, hi: number): string {
  if (!(lo > 0)) return 'по запросу';
  const mln = (v: number) => (v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (lo >= 1_000_000) {
    if (!(hi > lo * 1.02)) return `${mln(lo)} млн ₽`;
    return `${mln(lo)}–${mln(hi)} млн ₽`;
  }
  return hi > lo ? `${shortChessPrice(lo)} – ${shortChessPrice(hi)} ₽` : `${shortChessPrice(lo)} ₽`;
}
