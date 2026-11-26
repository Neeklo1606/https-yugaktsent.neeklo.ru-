export interface ResidentialComplex {
  id: string;
  slug: string;
  name: string;
  description: string;
  builder: string;
  district: string;
  subway: string;
  subwayDistance: string;
  nearbySubways?: {
    name: string;
    distanceTime: number | null;
    distanceType?: 1 | 2 | null;
  }[];
  address: string;
  deadline: string;
  status: 'building' | 'completed' | 'planned';
  priceFrom: number;
  priceTo: number;
  images: string[];
  coords: [number, number];
  /** false — координат в данных нет, coords содержит запасной центр и карту рисовать нельзя */
  hasCoords?: boolean;
  advantages: string[];
  infrastructure: string[];
  buildings: Building[];
  /** Если задано (данные с API), в карточке показываем число объявлений вместо разбора mock-квартир по корпусам. */
  listingCount?: number;
  /** ISO дата старта продаж (API `salesStartDate`) — оверлей на обложке. */
  salesStartDate?: string | null;
  /** Плашка «Новый ЖК» на обложке (API `isPromoted`). */
  isPromoted?: boolean;
  /** Видовые квартиры в продаже (если API отдаёт). */
  scenicCount?: number | null;
  /** Минимальные цены по комнатности (если API отдаёт `price_ranges`). */
  priceRanges?: { rooms: number; priceMin: number; priceMax?: number }[];
  /** Доходность / yield (если API отдаёт). */
  yieldMin?: number | null;
  yieldMax?: number | null;
}

export interface Building {
  id: string;
  complexId: string;
  name: string;
  floors: number;
  sections: number;
  deadline: string;
  apartments: Apartment[];
}

export interface Apartment {
  id: string;
  complexId: string;
  buildingId: string;
  rooms: number;
  area: number;
  kitchenArea: number;
  floor: number;
  totalFloors: number;
  price: number;
  pricePerMeter: number;
  /** '' — застройщик не указал отделку (не подставляем «чистовую» наугад) */
  finishing: 'без отделки' | 'черновая' | 'предчистовая' | 'чистовая' | 'под ключ' | '';
  status: 'available' | 'reserved' | 'sold';
  planImage: string;
  /** Фото отделки (URL из медиатеки или внешний). */
  finishingImage?: string;
  /** Доп. фото (вид из окна и т.д.). */
  galleryImages?: string[];
  section: number;
  /** Номер квартиры/лота из источника. */
  number?: string;
  /** Название корпуса/строения. */
  buildingName?: string;
  /** Очередь строительства (если есть в источнике). */
  buildingQueue?: string;
}

export interface LayoutGroup {
  id: string;
  complexId: string;
  apartmentId?: string;
  rooms: number;
  area: number;
  priceFrom: number;
  /** Самая дорогая квартира этой планировки (для «от … до …») */
  priceTo?: number;
  planImage: string;
  availableCount: number;
}

export type SortField = 'price' | 'area' | 'floor' | 'rooms';
export type SortDir = 'asc' | 'desc';

export type ObjectType = 'apartments' | 'rooms' | 'houses' | 'land' | 'dachas' | 'commercial';
export type MarketType = 'all' | 'new' | 'secondary';

export interface CatalogFilters {
  objectType: ObjectType;
  marketType: MarketType;
  priceMin?: number;
  priceMax?: number;
  rooms: number[];
  areaMin?: number;
  areaMax?: number;
  landAreaMin?: number;
  landAreaMax?: number;
  distanceMin?: number;
  distanceMax?: number;
  directions: string[];
  houseLocation: string[];
  district: string[];
  subway: string[];
  builder: string[];
  deadline: string[];
  /** land.landCategory — ИЖС, СНТ, Коммерция */
  landPurpose: string[];
  /** commercial.commercialType — OFFICE, RETAIL, … */
  commercialTypes: string[];
  /** house.material */
  houseMaterials: string[];
  floorMin?: number;
  floorMax?: number;
  status: string[];
  search: string;
}

export const defaultFilters: CatalogFilters = {
  objectType: 'apartments',
  marketType: 'all',
  rooms: [],
  directions: [],
  houseLocation: [],
  district: [],
  subway: [],
  builder: [],
  deadline: [],
  landPurpose: [],
  commercialTypes: [],
  houseMaterials: [],
  status: [],
  search: '',
};
