import type { Apartment, Building, ResidentialComplex } from '@/redesign/data/types';
import { mapListingRowToApartment, type ApiListingRow } from '@/redesign/lib/blocks-from-api';

const PLACEHOLDER = '/placeholder.svg';

/** Ответ GET /listings/:id (вложенность под findOne в Nest). */
export type ApiListingDetail = ApiListingRow & {
  kind?: string;
  block: null | {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    latitude?: unknown;
    longitude?: unknown;
    addresses?: { address: string }[];
    images?: { url: string }[];
    subways?: { distanceTime: number | null; subway: { name: string } }[];
  };
  building: null | { id: number; name: string | null };
  builder: null | { name: string };
  district: null | { name: string };
};

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deadlineFromApartment(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`;
}

/**
 * Данные для страницы квартиры из одного листинга API.
 */
export function mapListingDetailToApartmentPage(listing: ApiListingDetail): {
  apartment: Apartment;
  complex: ResidentialComplex;
  building: Building;
} | null {
  const block = listing.block;
  if (!block || !listing.apartment) return null;
  if (listing.kind && listing.kind !== 'APARTMENT') return null;

  const buildingId = listing.buildingId != null ? String(listing.buildingId) : `${block.id}-main`;
  const apartment = mapListingRowToApartment(listing as ApiListingRow, String(block.id), buildingId);
  if (!apartment) return null;

  const metro = block.subways?.[0];
  const addr = block.addresses?.[0]?.address ?? listing.apartment.blockAddress ?? '';
  const lat = num(block.latitude);
  const lng = num(block.longitude);
  // Без координат карту не рисуем вовсе: раньше подставлялась Москва и флаг hasCoords не ставился
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const imgs = block.images?.length ? block.images.map((i) => i.url) : [PLACEHOLDER];

  const complex: ResidentialComplex = {
    id: String(block.id),
    slug: block.slug,
    name: block.name,
    description: block.description?.trim() || '',
    builder: listing.builder?.name ?? '',
    district: listing.district?.name ?? '',
    subway: metro?.subway.name ?? '',
    subwayDistance: metro?.distanceTime != null ? `${metro.distanceTime} мин` : '',
    address: addr,
    deadline: deadlineFromApartment(
      listing.apartment.buildingDeadline ? String(listing.apartment.buildingDeadline) : undefined,
    ),
    status: 'building',
    priceFrom: apartment.price,
    priceTo: apartment.price,
    images: imgs,
    coords: hasCoords ? [lat, lng] : [0, 0],
    hasCoords,
    advantages: [],
    infrastructure: [],
    buildings: [],
  };

  const building: Building = {
    id: buildingId,
    complexId: String(block.id),
    name: listing.building?.name ?? listing.apartment.buildingName ?? listing.apartment.buildingQueue ?? 'Корпус',
    floors: apartment.totalFloors,
    sections: 1,
    deadline: deadlineFromApartment(
      listing.apartment.buildingDeadline ? String(listing.apartment.buildingDeadline) : undefined,
    ),
    apartments: [],
  };

  return { apartment, complex, building };
}
