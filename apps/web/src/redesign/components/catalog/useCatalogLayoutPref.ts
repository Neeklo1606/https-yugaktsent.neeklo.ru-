import { useCallback, useEffect, useState } from 'react';

/** «Список» или «Список + карта» на широком экране */
export type CatalogLayoutPref = 'list' | 'split';

const STORAGE_KEY = 'ugacent.catalog.layout';
/** С этой ширины карта стоит рядом со списком (Tailwind xl) */
export const CATALOG_SPLIT_MEDIA = '(min-width: 1280px)';

function readPref(): CatalogLayoutPref {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'list' || v === 'split') return v;
  } catch {
    /* приватный режим / запрет хранилища — берём умолчание */
  }
  return 'split';
}

function writePref(v: CatalogLayoutPref): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* не критично: выбор просто не запомнится */
  }
}

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setValue(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return value;
}

/** Выбор раскладки каталога, запомненный в браузере, и факт широкого экрана */
export function useCatalogLayoutPref() {
  const [pref, setPrefState] = useState<CatalogLayoutPref>(() => (typeof window === 'undefined' ? 'split' : readPref()));
  const isWide = useMediaQuery(CATALOG_SPLIT_MEDIA);
  const setPref = useCallback((next: CatalogLayoutPref) => {
    setPrefState(next);
    writePref(next);
  }, []);
  return { pref, setPref, isWide };
}
