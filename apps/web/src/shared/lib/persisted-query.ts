/**
 * Кэш публичных справочников (регионы, настройки сайта) между визитами.
 *
 * Первый экран главной ждёт цепочку «настройки + регионы → ЖК». При повторном
 * визите справочники берутся из кэша сразу (initialData), а свежие данные
 * подтягиваются в фоне — первый экран не ждёт сеть. Только публичные данные;
 * в localStorage ничего персонального не пишется.
 */
const PREFIX = 'yug_qcache:';
const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Entry<T> = { v: number; at: number; data: T };

export function readPersisted<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.v !== VERSION || Date.now() - entry.at > MAX_AGE_MS) return undefined;
    return entry.data;
  } catch {
    return undefined;
  }
}

export function writePersisted<T>(key: string, data: T): T {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: VERSION, at: Date.now(), data } satisfies Entry<T>));
  } catch {
    /* переполнено или приватный режим — просто без кэша */
  }
  return data;
}

/**
 * Опции React Query: данные из кэша показываются сразу, но считаются устаревшими
 * (initialDataUpdatedAt: 0), поэтому запрос в сеть всё равно уходит.
 */
export function persistedQueryOptions<T>(key: string) {
  return {
    initialData: () => readPersisted<T>(key),
    initialDataUpdatedAt: 0,
  };
}
