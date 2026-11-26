import {
  buildChessboardBuildingMatrix,
  type ChessboardApartmentInput,
  type ChessboardBlockResponse,
  type ChessboardBuildingMatrix,
} from '@lg/shared';
import { ListingKind, ListingStatus } from '@prisma/client';

const MIN_REASONABLE_PRICE_RUB = 100_000;

type ListingRow = {
  id: number;
  buildingId: number | null;
  price: { toNumber?: () => number } | number | string | null;
  status: ListingStatus;
  apartment: null | {
    floor: number | null;
    number: string | null;
    areaTotal: { toNumber?: () => number } | number | string | null;
    areaKitchen: { toNumber?: () => number } | number | string | null;
    planUrl: string | null;
    buildingName?: string | null;
    section?: number | null;
    roomType: { name: string | null; nameOne: string | null } | null;
    finishing: { name: string | null } | null;
  };
};

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roomsFromRoomTypeName(name: string | undefined | null): number {
  const n = (name ?? '').toLowerCase();
  if (n.includes('студ')) return 0;
  const m = n.match(/(\d)/);
  if (m) return Math.min(9, parseInt(m[1], 10));
  return 1;
}

function listingStatus(s: ListingStatus): ChessboardApartmentInput['status'] {
  if (s === ListingStatus.RESERVED) return 'reserved';
  if (s === ListingStatus.SOLD || s === ListingStatus.INACTIVE) return 'sold';
  return 'available';
}

const isSoldRow = (row: ListingRow) => row.status === ListingStatus.SOLD || row.status === ListingStatus.INACTIVE;

/**
 * Проданные/снятые лоты: берём только те, что не дублируют квартиру в продаже.
 * Снятые (INACTIVE) без номера пропускаем — это могут быть дубли из старых выгрузок.
 */
export function dedupeChessboardRows(rows: ListingRow[]): ListingRow[] {
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = (r: ListingRow) =>
    `${r.buildingId ?? ''}|${norm(r.apartment?.buildingName)}|${r.apartment?.floor ?? ''}|${norm(r.apartment?.number)}`;
  const live = rows.filter((r) => !isSoldRow(r));
  const taken = new Set(live.filter((r) => norm(r.apartment?.number)).map(key));
  const out = [...live];
  for (const r of rows) {
    if (!isSoldRow(r)) continue;
    const num = norm(r.apartment?.number);
    if (r.status === ListingStatus.INACTIVE && !num) continue;
    if (num) {
      const k = key(r);
      if (taken.has(k)) continue;
      taken.add(k);
    }
    out.push(r);
  }
  return out;
}

/** Отделка из данных застройщика; если её нет — «—» (раньше подставлялась «чистовая» всем). */
function mapFinishing(name: string | undefined | null): string {
  const n = (name ?? '').toLowerCase().trim();
  if (!n) return '—';
  if (n.includes('предчист') || n.includes('white')) return 'предчистовая';
  if (n.includes('чернов')) return 'черновая';
  if (n.includes('без отделк')) return 'без отделки';
  if (n.includes('под ключ') || n.includes('дизайн')) return 'под ключ';
  if (n.includes('чистов')) return 'чистовая';
  return n;
}

export function mapListingToChessboardInput(row: ListingRow): ChessboardApartmentInput | null {
  const apt = row.apartment;
  if (!apt) return null;
  const floor = apt.floor;
  if (floor == null || floor <= 0 || floor > 200) return null;
  const area = num(apt.areaTotal);
  if (area <= 0) return null;
  const price = isSoldRow(row) ? 0 : num(row.price);
  const safePrice = price >= MIN_REASONABLE_PRICE_RUB ? price : 0;
  const kitchen = num(apt.areaKitchen);
  let rooms = roomsFromRoomTypeName(apt.roomType?.nameOne ?? apt.roomType?.name);
  if (!apt.roomType && kitchen <= 0 && area > 0 && area <= 35) {
    rooms = 0;
  }
  return {
    id: String(row.id),
    number: apt.number != null ? String(apt.number) : '',
    floor: apt.floor ?? 1,
    rooms,
    area,
    price: safePrice,
    pricePerMeter: safePrice > 0 ? Math.round(safePrice / area) : 0,
    finishing: mapFinishing(apt.finishing?.name),
    status: listingStatus(row.status),
    section: apt.section ?? 1,
    planImage: apt.planUrl?.trim() || null,
  };
}

/**
 * Сайт рисует шахматку по grid + shafts; columns, topology и floorTemplates дублируют grid
 * и раздували ответ до 3,5 МБ. Оставляем пустыми (поля в контракте сохраняются).
 */
export function slimChessboardMatrix(m: ChessboardBuildingMatrix): ChessboardBuildingMatrix {
  return {
    ...m,
    columns: [],
    floorTemplates: [],
    topology: { sectionCount: m.topology.sectionCount, shafts: [], floorTemplates: [], apartmentToShaft: {} },
    shafts: m.shafts.map((s) => ({ ...s, mirroredPlanSignatures: [], floorsPresent: [], apartmentIds: [] })),
  };
}

export function buildBlockChessboardResponse(
  block: {
    id: number;
    slug: string;
    name: string;
    buildings: Array<{ id: number; name: string | null; deadline?: Date | string | null }>;
  },
  listings: ListingRow[],
): ChessboardBlockResponse {
  const buildings = block.buildings.length
    ? block.buildings
    : [{ id: block.id, name: 'Корпус 1' }];

  // Квартира → корпус: по buildingId, а если его нет (лоты из фидов) — по названию корпуса
  // в квартире. Раньше всё без buildingId падало в первый корпус, и корпуса сливались в одну сетку.
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const indexById = new Map(buildings.map((b, i) => [String(b.id), i]));
  const indexByName = new Map(buildings.map((b, i) => [norm(b.name), i] as const).filter(([n]) => n));
  const buckets: ListingRow[][] = buildings.map(() => []);
  for (const l of dedupeChessboardRows(listings)) {
    let idx = l.buildingId != null ? indexById.get(String(l.buildingId)) : undefined;
    if (idx === undefined) idx = indexByName.get(norm(l.apartment?.buildingName));
    buckets[idx ?? 0].push(l);
  }

  const built = buildings.map((b, idx) => {
    const apts = buckets[idx]
      .map(mapListingToChessboardInput)
      .filter((x): x is ChessboardApartmentInput => x != null);
    const matrix = slimChessboardMatrix(buildChessboardBuildingMatrix(String(b.id), b.name ?? `Корпус ${idx + 1}`, apts));
    const dl = b.deadline ? new Date(b.deadline) : null;
    matrix.deadline = dl && !Number.isNaN(dl.getTime()) ? dl.toISOString() : null;
    return { count: apts.length, matrix };
  });
  // Пустые корпуса и корпуса, где всё продано, не показываем, если есть корпуса с квартирами в продаже
  const withLive = built.filter((x) => x.matrix.statusCounts.available + x.matrix.statusCounts.reserved > 0);
  const nonEmpty = withLive.length ? withLive : built.filter((x) => x.count > 0);
  const buildingMatrices = (nonEmpty.length ? nonEmpty : built.slice(0, 1)).map((x) => x.matrix);

  return {
    blockId: block.id,
    slug: block.slug,
    name: block.name,
    buildings: buildingMatrices,
  };
}

export const CHESSBOARD_LISTING_STATUSES: ListingStatus[] = [
  ListingStatus.ACTIVE,
  ListingStatus.RESERVED,
  ListingStatus.SOLD,
];

/** Проданные и снятые с продажи — для серых ячеек «продано» */
export const CHESSBOARD_SOLD_STATUSES: ListingStatus[] = [ListingStatus.SOLD, ListingStatus.INACTIVE];

export const CHESSBOARD_LISTING_KIND = ListingKind.APARTMENT;
