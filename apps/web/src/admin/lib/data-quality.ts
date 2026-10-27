import type { ApiBlockListRow } from '@/redesign/lib/blocks-from-api';

export type DataIssueKind =
  | 'no_photos'
  | 'photo_unreachable'
  | 'no_address'
  | 'no_coords'
  | 'no_description'
  | 'no_price'
  | 'no_builder'
  | 'no_deadline';

export type DataIssue = {
  kind: DataIssueKind;
  /** Насколько мешает витрине: critical — ЖК выглядит сломанным, warn — неполные данные */
  severity: 'critical' | 'warn';
  blockId: number;
  blockName: string;
  slug: string;
  /** Что увидит пользователь админки */
  message: string;
};

export const ISSUE_LABEL: Record<DataIssueKind, string> = {
  no_photos: 'Фото отсутствует: требуется проверка источника',
  photo_unreachable: 'Фото не загружается у источника',
  no_address: 'Нет адреса',
  no_coords: 'Нет координат — карта не покажется',
  no_description: 'Нет описания',
  no_price: 'Нет цены в продаже',
  no_builder: 'Не указан застройщик',
  no_deadline: 'Не указан срок сдачи',
};

const CRITICAL: ReadonlySet<DataIssueKind> = new Set(['no_photos', 'photo_unreachable', 'no_price']);

function hasCoords(b: ApiBlockListRow): boolean {
  const lat = Number(b.latitude);
  const lng = Number(b.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) && b.latitude != null && b.longitude != null;
}

/**
 * Проверки по данным, которые витрина уже получает из публичного API.
 * Ничего не придумывает: только то, чего в ответе API действительно нет.
 */
export function auditBlocks(rows: ApiBlockListRow[], unreachablePhotoIds: ReadonlySet<number> = new Set()): DataIssue[] {
  const out: DataIssue[] = [];
  for (const b of rows) {
    const push = (kind: DataIssueKind) =>
      out.push({ kind, severity: CRITICAL.has(kind) ? 'critical' : 'warn', blockId: b.id, blockName: b.name, slug: b.slug, message: ISSUE_LABEL[kind] });
    if (!b.images?.length) push('no_photos');
    else if (unreachablePhotoIds.has(b.id)) push('photo_unreachable');
    if (!b.addresses?.some((a) => a.address?.trim())) push('no_address');
    if (!hasCoords(b)) push('no_coords');
    if (!b.description?.trim()) push('no_description');
    if (!(Number(b.listingPriceMin) > 0)) push('no_price');
    if (!b.builder?.name?.trim()) push('no_builder');
    if (!b.buildings?.some((x) => x.deadline)) push('no_deadline');
  }
  return out.sort((a, z) => (a.severity === z.severity ? a.blockName.localeCompare(z.blockName, 'ru') : a.severity === 'critical' ? -1 : 1));
}

/** Хост картинки — чтобы показать, у какого источника проблема (pb16100.tochno.profitbase.ru) */
export function imageHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
