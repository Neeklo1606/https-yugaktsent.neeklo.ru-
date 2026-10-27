import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { persistedQueryOptions, writePersisted } from '@/shared/lib/persisted-query';

type SettingRow = { key: string; value: string };
type SettingsResponse = Record<string, SettingRow[]>;

/**
 * Загрузка site_settings из CMS. Возвращает map key→value.
 */
export function useSiteSettings() {
  return useQuery({
    queryKey: ['content', 'settings'],
    queryFn: async () => writePersisted('content-settings', await apiGet<SettingsResponse>('/content/settings')),
    staleTime: 10 * 60_000,
    // Повторный визит: логотип, контакты и баннеры — сразу из кэша, свежие подтягиваются в фоне
    ...persistedQueryOptions<SettingsResponse>('content-settings'),
    select: (grouped) => {
      const flat = new Map<string, string>();
      for (const rows of Object.values(grouped)) {
        for (const r of rows) {
          flat.set(r.key, r.value);
        }
      }
      return flat;
    },
  });
}

export function setting(map: Map<string, string> | undefined, key: string, fallback: string): string {
  const v = map?.get(key);
  if (v != null && v.trim().length > 0) return v.trim();
  return fallback;
}

/** Значение настройки или undefined, если ключ отсутствует или строка пустая (пробелы не считаются). */
export function settingOptional(map: Map<string, string> | undefined, key: string): string | undefined {
  const v = map?.get(key);
  if (v == null) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}
