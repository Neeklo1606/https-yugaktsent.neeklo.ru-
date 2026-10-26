import type { Apartment, Building, LayoutGroup, ResidentialComplex } from '@/redesign/data/types';
import { MIN_REASONABLE_PRICE_RUB } from '@/redesign/lib/display-price';
import { normalizePriceValue } from '@/redesign/lib/display-price';
import { IMAGE_PLACEHOLDER } from '@/redesign/lib/image-media';

export type ApiBlockListRow = {
  id: number;
  slug: string;
  name: string;
  isPromoted?: boolean;
  description?: string | null;
  dataSource?: string;
  status: string;
  salesStartDate?: string | Date | null;
  latitude?: unknown;
  longitude?: unknown;
  region?: { id: number; code?: string; name?: string } | null;
  district?: { name: string } | null;
  builder?: { name: string } | null;
  addresses?: { address: string }[];
  images?: { url: string }[];
  subways?: { distanceTime: number | null; distanceType?: 1 | 2 | null; subway: { name: string } }[];
  infrastructure?: unknown;
  _count?: { listings: number };
  listingPriceMin?: number | null;
  listingPriceMax?: number | null;
  priceRanges?: { rooms: number; priceMin: number }[];
  scenicCount?: number | null;
  buildings?: {
    id: number;
    name: string | null;
    deadline: string | null;
    deadlineKey?: string | Date | null;
  }[];
};

export type ApiBlockDetail = ApiBlockListRow & {
  region?: { id: number; code?: string; name?: string } | null;
  buildings?: {
    id: number;
    name: string | null;
    queue: string | null;
    deadline: string | null;
  }[];
};

export type ApiListingRow = {
  id: number;
  blockId: number | null;
  buildingId: number | null;
  price: string | number | null;
  status: string;
  kind?: string;
  builder?: { name: string } | null;
  building?: { name: string | null } | null;
  house?: null | {
    areaTotal?: string | number | null;
    areaKitchen?: string | number | null;
    floorsCount?: number | null;
    bedrooms?: number | null;
    photoUrl?: string | null;
    extraPhotoUrls?: unknown;
  };
  apartment: null | {
    floor: number | null;
    floorsTotal: number | null;
    areaTotal: string | number | null;
    areaKitchen: string | number | null;
    planUrl: string | null;
    finishingPhotoUrl?: string | null;
    extraPhotoUrls?: unknown;
    roomType: { name: string } | null;
    rooms?: number | string | null;
    section?: number | string | null;
    number?: string | number | null;
    finishing: { name: string } | null;
    buildingDeadline?: string | null;
    buildingName?: string | null;
    buildingQueue?: string | null;
  };
};

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function coordsFromBlock(b: ApiBlockListRow): [number, number] {
  const lat = num(b.latitude);
  const lng = num(b.longitude);
  if (lat && lng) return [lat, lng];
  // Запасной центр, чтобы карта не падала; рисовать метку по нему нельзя — см. hasBlockCoords
  return [55.75, 37.62];
}

/** Есть ли у ЖК настоящие координаты (а не запасной центр). */
function hasBlockCoords(b: ApiBlockListRow): boolean {
  return Boolean(num(b.latitude) && num(b.longitude));
}

function statusFromApi(s: string): ResidentialComplex['status'] {
  if (s === 'COMPLETED') return 'completed';
  if (s === 'PROJECT') return 'planned';
  return 'building';
}

function deadlineLabel(b: ApiBlockListRow): string {
  if (b.status === 'COMPLETED') return 'Сдан';
  if (b.status === 'BUILDING') return 'Строится';
  if (b.status === 'PROJECT') return 'Проект';
  return '';
}

function quarterLabel(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  return `${quarter} кв. ${d.getFullYear()}`;
}

function buildingDeadlineLabel(bg: {
  deadline?: string | null;
  deadlineKey?: string | Date | null;
}): string {
  const key = bg.deadlineKey;
  if (key != null) {
    const d = key instanceof Date ? key : new Date(String(key));
    if (!Number.isNaN(d.getTime())) {
      const quarter = Math.ceil((d.getMonth() + 1) / 3);
      return `${quarter} кв. ${d.getFullYear()}`;
    }
  }
  const raw = bg.deadline?.trim() || '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.includes('T')) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const quarter = Math.ceil((d.getMonth() + 1) / 3);
      return `${quarter} кв. ${d.getFullYear()}`;
    }
  }
  return raw;
}

/** Плоский список ЖК (каталог, автодополнение). */
export function mapApiBlockListRowToResidentialComplex(b: ApiBlockListRow): ResidentialComplex {
  const addr = b.addresses?.[0]?.address ?? '';
  const metro = b.subways?.[0];
  const imgs = (b.images?.length ? b.images.map((i) => i.url) : [IMAGE_PLACEHOLDER]).slice(0, 6);
  const rawMin = b.listingPriceMin != null ? Math.round(b.listingPriceMin) : 0;
  const rawMax = b.listingPriceMax != null ? Math.round(b.listingPriceMax) : rawMin;
  // Отсекаем «мусор» вида 0..999 ₽ — карточка покажет «—».
  const priceMin = rawMin >= MIN_REASONABLE_PRICE_RUB ? rawMin : 0;
  const priceMax = rawMax >= MIN_REASONABLE_PRICE_RUB ? rawMax : priceMin;

  return {
    id: String(b.id),
    slug: b.slug,
    name: b.name,
    // Пустое описание — пустая строка: страница скрывает блок, а не пишет «появится позже»
    description: b.description?.trim() || '',
    builder: b.builder?.name ?? '',
    district: b.district?.name ?? '',
    subway: metro?.subway.name ?? '',
    subwayDistance: metro?.distanceTime != null ? `${metro.distanceTime} мин` : '',
    nearbySubways: (b.subways ?? [])
      .map((x) => ({
        name: x.subway?.name ?? '',
        distanceTime: x.distanceTime ?? null,
        distanceType: x.distanceType ?? null,
      }))
      .filter((x) => x.name.trim().length > 0)
      .sort((a, z) => (a.distanceTime ?? Number.MAX_SAFE_INTEGER) - (z.distanceTime ?? Number.MAX_SAFE_INTEGER)),
    address: addr || '',
    deadline: deadlineLabel(b),
    status: statusFromApi(b.status),
    priceFrom: priceMin,
    priceTo: priceMax || priceMin,
    images: imgs,
    coords: coordsFromBlock(b),
    hasCoords: hasBlockCoords(b),
    advantages: [],
    infrastructure: extractInfrastructureLabels(b.infrastructure),
    buildings: (b.buildings ?? []).map((bg) => ({
      id: String(bg.id),
      complexId: String(b.id),
      name: bg.name?.trim() || 'Корпус',
      floors: 1,
      sections: 1,
      deadline: buildingDeadlineLabel(bg),
      apartments: [],
    })),
    listingCount: b._count?.listings,
    priceRanges: b.priceRanges,
    isPromoted: Boolean(b.isPromoted),
    scenicCount: b.scenicCount ?? null,
    salesStartDate:
      b.salesStartDate != null
        ? typeof b.salesStartDate === 'string'
          ? b.salesStartDate
          : b.salesStartDate.toISOString()
        : null,
  };
}

function extractInfrastructureLabels(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const t = item.trim();
      if (t) out.push(t);
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      const distance =
        typeof obj.distance === 'number' || typeof obj.distance === 'string'
          ? String(obj.distance)
          : '';
      if (name) {
        out.push(distance ? `${name} · ${distance}` : name);
      }
    }
  }
  return out;
}

function mapFinishing(name: string | undefined): Apartment['finishing'] {
  const n = (name ?? '').toLowerCase();
  if (n.includes('чернов')) return 'черновая';
  if (n.includes('предчист') || n.includes('подчист')) return 'чистовая';
  if (n.includes('чистов') || n.includes('white box')) return 'чистовая';
  if (n.includes('под ключ') || n.includes('whitebox')) return 'под ключ';
  if (n.includes('без отделк')) return 'без отделки';
  return 'чистовая';
}

function roomsFromRoomTypeName(name: string | undefined, fallback?: unknown): number {
  const n = (name ?? '').toLowerCase();
  if (n.includes('студ')) return 0;
  const m = n.match(/(\d)/);
  if (m) {
    const r = parseInt(m[1], 10);
    return r > 4 ? 4 : r;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return Math.max(0, Math.min(4, Math.trunc(fallback)));
  }
  if (typeof fallback === 'string') {
    const f = fallback.toLowerCase();
    if (f.includes('студ')) return 0;
    const mf = f.match(/(\d)/);
    if (mf) {
      const r = parseInt(mf[1], 10);
      return r > 4 ? 4 : r;
    }
  }
  return 1;
}

function listingStatus(s: string): Apartment['status'] {
  if (s === 'RESERVED') return 'reserved';
  if (s === 'SOLD') return 'sold';
  return 'available';
}

function mapHouseListingRowToApartment(
  listing: ApiListingRow,
  complexId: string,
  defaultBuildingId: string,
): Apartment | null {
  const house = listing.house;
  if (!house) return null;
  const area = num(house.areaTotal);
  const price = num(listing.price);
  if (area <= 0) return null;
  const safePrice = price >= MIN_REASONABLE_PRICE_RUB ? price : 0;
  const kitchen = num(house.areaKitchen);
  const floors = house.floorsCount ?? 1;
  const buildingName = listing.building?.name?.trim() || undefined;
  const gallery =
    Array.isArray(house.extraPhotoUrls) && house.extraPhotoUrls.length
      ? house.extraPhotoUrls.filter((x): x is string => typeof x === 'string')
      : undefined;
  const rooms =
    house.bedrooms != null && house.bedrooms > 0
      ? Math.min(4, house.bedrooms)
      : area >= 150
        ? 4
        : area >= 120
          ? 3
          : area >= 90
            ? 2
            : 1;
  return {
    id: String(listing.id),
    complexId,
    buildingId: listing.buildingId != null ? String(listing.buildingId) : defaultBuildingId,
    rooms,
    area,
    kitchenArea: kitchen > 0 ? kitchen : Math.round(area * 0.2 * 10) / 10,
    floor: 1,
    totalFloors: floors > 0 ? floors : 1,
    price: safePrice,
    pricePerMeter: safePrice > 0 ? Math.round(safePrice / area) : 0,
    finishing: 'без отделки',
    status: listingStatus(listing.status),
    planImage:
      (typeof house.photoUrl === 'string' && house.photoUrl.trim()) ||
      (gallery && gallery[0]) ||
      IMAGE_PLACEHOLDER,
    galleryImages: gallery,
    section: 1,
    number: buildingName ? `${buildingName}.${Math.round(area)}` : undefined,
    buildingName,
  };
}

export function mapListingRowToApartment(
  listing: ApiListingRow,
  complexId: string,
  defaultBuildingId: string,
): Apartment | null {
  const apt = listing.apartment;
  if (!apt) {
    if (listing.kind === 'HOUSE') {
      return mapHouseListingRowToApartment(listing, complexId, defaultBuildingId);
    }
    return null;
  }
  const area = num(apt.areaTotal);
  const price = num(listing.price);
  if (area <= 0) return null;
  // Отбрасываем мусорные цены (<100 000 ₽), но саму квартиру оставляем для шахматки.
  const safePrice = price >= MIN_REASONABLE_PRICE_RUB ? price : 0;
  const kitchen = num(apt.areaKitchen);
  const floor = apt.floor ?? 1;
  const totalFloors = apt.floorsTotal ?? 1;
  let inferredRooms = roomsFromRoomTypeName(apt.roomType?.name, apt.rooms);
  // Донор иногда не передаёт roomType для студий: эвристика по нулевой кухне + малой площади.
  if (!apt.roomType && kitchen <= 0 && area > 0 && area <= 35) {
    inferredRooms = 0;
  }
  const gallery =
    Array.isArray(apt.extraPhotoUrls) && apt.extraPhotoUrls.length
      ? apt.extraPhotoUrls.filter((x): x is string => typeof x === 'string')
      : undefined;
  const finishingImg =
    typeof apt.finishingPhotoUrl === 'string' && apt.finishingPhotoUrl.trim()
      ? apt.finishingPhotoUrl
      : undefined;
  return {
    id: String(listing.id),
    complexId,
    buildingId: listing.buildingId != null ? String(listing.buildingId) : defaultBuildingId,
    rooms: inferredRooms,
    area,
    kitchenArea: kitchen > 0 ? kitchen : Math.round(area * 0.15 * 10) / 10,
    floor,
    totalFloors: totalFloors > 0 ? totalFloors : 1,
    price: safePrice,
    pricePerMeter: safePrice > 0 ? Math.round(safePrice / area) : 0,
    finishing: mapFinishing(apt.finishing?.name),
    status: listingStatus(listing.status),
    planImage:
      (typeof apt.planUrl === 'string' && apt.planUrl.trim()) ||
      finishingImg ||
      (gallery && gallery[0]) ||
      IMAGE_PLACEHOLDER,
    finishingImage: finishingImg,
    galleryImages: gallery,
    section: Number.isFinite(Number(apt.section)) ? Number(apt.section) : 1,
    number: apt.number != null ? String(apt.number) : undefined,
    buildingName: typeof apt.buildingName === 'string' ? apt.buildingName : undefined,
    buildingQueue: typeof apt.buildingQueue === 'string' ? apt.buildingQueue : undefined,
  };
}

export function buildLayoutGroupsFromApartments(complexId: string, apartments: Apartment[]): LayoutGroup[] {
  const map = new Map<string, LayoutGroup>();
  for (const a of apartments) {
    // Считаем «в продаже» = свободные + забронированные. Так совпадает со списком
    // квартир (где исключены только проданные) и убирает рассинхрон 128 vs 124.
    if (a.status === 'sold') continue;
    const key = `${a.rooms}-${a.planImage || 'no-plan'}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        complexId,
        rooms: a.rooms,
        area: a.area,
        apartmentId: a.id,
        priceFrom: a.price,
        planImage: a.planImage,
        availableCount: 0,
      });
    }
    const g = map.get(key)!;
    g.availableCount++;
    const p = normalizePriceValue(a.price);
    if (p != null && (g.priceFrom <= 0 || p < g.priceFrom)) {
      g.priceFrom = p;
      g.apartmentId = a.id;
    }
  }
  return Array.from(map.values()).sort((x, y) => x.rooms - y.rooms || x.area - y.area);
}

/** Карточка ЖК из ответа GET /blocks/:id|slug + опционально квартиры из GET /listings. */
export function mapApiBlockDetailToResidentialComplex(
  b: ApiBlockDetail,
  listingRows: ApiListingRow[] = [],
): ResidentialComplex {
  const base = mapApiBlockListRowToResidentialComplex(b);
  const imgs = (b.images?.length ? b.images.map((i) => i.url) : base.images).slice(0, 12);
  const virtualId = `${b.id}-main`;

  const rawBuildings = b.buildings?.length ? b.buildings : null;

  const buildingShells: Building[] = rawBuildings
    ? rawBuildings.map((raw, idx) => {
        const id = String(raw.id);
        const aptsForB = listingRows
          .filter((l) => (l.buildingId != null ? String(l.buildingId) === id : idx === 0))
          .map((l) => mapListingRowToApartment(l, String(b.id), id))
          .filter((x): x is Apartment => x != null);
        const maxFloor = aptsForB.reduce((m, a) => Math.max(m, a.floor), 0);
        return {
          id,
          complexId: String(b.id),
          name: raw.name || raw.queue || `Корпус ${idx + 1}`,
          floors: maxFloor > 0 ? maxFloor : 25,
          sections: 1,
          deadline: raw.deadline
            ? (() => {
                const d = new Date(raw.deadline);
                if (Number.isNaN(d.getTime())) return '';
                const quarter = Math.ceil((d.getMonth() + 1) / 3);
                return `${quarter} кв. ${d.getFullYear()}`;
              })()
            : base.deadline,
          apartments: aptsForB,
        };
      })
    : [
        {
          id: virtualId,
          complexId: String(b.id),
          name: 'Корпус 1',
          floors: 25,
          sections: 1,
          deadline: base.deadline,
          apartments: listingRows
            .map((l) => mapListingRowToApartment(l, String(b.id), virtualId))
            .filter((x): x is Apartment => x != null),
        },
      ];

  const allApts = buildingShells.flatMap((x) => x.apartments);
  // Цены берём только у свободных и забронированных, и только с валидной (>0) ценой,
  // чтобы «от …» не схлопывалась в 0 из-за мусора в фиде.
  const inSalePrices = allApts
    .filter((a) => a.status !== 'sold' && normalizePriceValue(a.price) != null)
    .map((a) => a.price);
  // Страница грузит только первую порцию квартир (per_page), поэтому «от», «до» и число
  // в продаже берём из агрегатов API по всему ЖК — те же, что у карточки каталога.
  // Посчитанное по загруженным — только запасной вариант, если агрегатов нет.
  const priceFrom = base.priceFrom > 0 ? base.priceFrom : inSalePrices.length ? Math.min(...inSalePrices) : 0;
  const priceTo = base.priceTo > 0 ? base.priceTo : inSalePrices.length ? Math.max(...inSalePrices) : 0;
  const inSaleFromLoaded = allApts.filter((a) => a.status !== 'sold').length;
  const listingCount = base.listingCount && base.listingCount > 0 ? base.listingCount : inSaleFromLoaded;
  const quarterDates = [
    ...(b.buildings ?? []).map((x) => quarterLabel(x.deadline)).filter((x): x is string => Boolean(x)),
    ...listingRows
      .map((x) => quarterLabel(x.apartment?.buildingDeadline ?? null))
      .filter((x): x is string => Boolean(x)),
  ];
  const uniqueQuarters = Array.from(new Set(quarterDates));
  const deadline =
    uniqueQuarters.length === 0
      ? base.deadline
      : uniqueQuarters.length === 1
        ? uniqueQuarters[0]
        : `с ${uniqueQuarters[0]} до ${uniqueQuarters[uniqueQuarters.length - 1]}`;
  const fallbackBuilder =
    listingRows
      .map((x) => x.builder?.name?.trim() ?? '')
      .find((name) => name.length > 0) ?? null;
  const builder = !base.builder && fallbackBuilder ? fallbackBuilder : base.builder;

  return {
    ...base,
    images: imgs.length ? imgs : base.images,
    builder,
    deadline,
    buildings: buildingShells,
    priceFrom: priceFrom || base.priceFrom,
    priceTo: priceTo || base.priceTo || priceFrom,
    listingCount,
  };
}
