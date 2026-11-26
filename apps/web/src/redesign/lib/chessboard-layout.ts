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

export function countChessCells(rows: ChessRow[]): ChessCounts {
  const c: ChessCounts = { available: 0, reserved: 0, soldOrClosed: 0, sold: 0, closed: 0, total: 0 };
  for (const r of rows) {
    for (const cell of r.cells) {
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
  /** Номер окна на этаже (по данным застройщика или по порядку) */
  label: string;
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
  return Array.from({ length: matrix.shaftCount }, (_, i) => {
    const s = shafts[i];
    const group = showGroups ? s?.group ?? null : null;
    const prev = i > 0 && showGroups ? shafts[i - 1]?.group ?? null : group;
    return {
      label: String(s?.position ?? i + 1),
      group,
      groupStart: showGroups && i > 0 && prev !== group,
    };
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
