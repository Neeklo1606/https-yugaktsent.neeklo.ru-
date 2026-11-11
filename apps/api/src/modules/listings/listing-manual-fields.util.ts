/**
 * Ручные правки против фида (идея LiveGrid `is_locked_by_manual`, сделанная по-настоящему).
 *
 * Менеджер правит объявление в админке → изменённые поля попадают в listing.manualFields.
 * Синхронизация фида (запрос с заголовком x-feed-sync) эти поля не трогает, остальные обновляет.
 * «Вернуть управление фиду» очищает список.
 */

export const MANUAL_FIELD_LABELS: Record<string, string> = {
  price: 'цена',
  publication: 'статус и публикация',
  'apartment.areaTotal': 'площадь',
  'apartment.areaKitchen': 'площадь кухни',
  'apartment.floor': 'этаж',
  'apartment.floorsTotal': 'этажность',
  'apartment.roomTypeId': 'комнатность',
  'apartment.buildingName': 'корпус',
  'apartment.number': 'номер квартиры',
  'apartment.planUrl': 'планировка',
};

const APT_KEYS = ['areaTotal', 'areaKitchen', 'floor', 'floorsTotal', 'roomTypeId', 'buildingName', 'number', 'planUrl'] as const;

type AptPatch = Partial<Record<(typeof APT_KEYS)[number], unknown>>;
export type ManualPatch = {
  price?: number;
  status?: string;
  isPublished?: boolean;
  apartment?: AptPatch & Record<string, unknown>;
};

export type CurrentListing = {
  price: unknown;
  status: string;
  isPublished: boolean;
  apartment?: (AptPatch & Record<string, unknown>) | null;
};

const asNum = (v: unknown) => (v == null || v === '' ? null : Number(String(v)));
const same = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  const na = asNum(a);
  const nb = asNum(b);
  if (na != null && nb != null && Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-6;
  return String(a ?? '') === String(b ?? '');
};

/** Какие поля правка менеджера действительно меняет (форма может прислать и неизменённые) */
export function changedManualFields(current: CurrentListing, dto: ManualPatch): string[] {
  const out: string[] = [];
  if (dto.price !== undefined && !same(current.price, dto.price)) out.push('price');
  if (
    (dto.status !== undefined && dto.status !== current.status) ||
    (dto.isPublished !== undefined && dto.isPublished !== current.isPublished)
  ) {
    out.push('publication');
  }
  if (dto.apartment) {
    for (const k of APT_KEYS) {
      if (dto.apartment[k] !== undefined && !same(current.apartment?.[k], dto.apartment[k])) out.push(`apartment.${k}`);
    }
  }
  return out;
}

/** Убирает из обновления фида поля, которые менеджер закрепил вручную */
export function stripLockedFields<T extends ManualPatch>(dto: T, locked: readonly string[]): T {
  if (!locked.length) return dto;
  const set = new Set(locked);
  const next: T = { ...dto };
  if (set.has('price')) delete next.price;
  if (set.has('publication')) {
    delete next.status;
    delete next.isPublished;
  }
  if (next.apartment) {
    const apt = { ...next.apartment };
    for (const k of APT_KEYS) if (set.has(`apartment.${k}`)) delete apt[k];
    next.apartment = apt;
  }
  return next;
}

export function mergeManualFields(prev: readonly string[] | null | undefined, added: readonly string[]): string[] {
  return [...new Set([...(prev ?? []), ...added])].sort();
}
