import { useEffect, useState } from 'react';
import { EXPERT_DRAFTS_EVENT, EXPERT_DRAFTS_STORAGE_KEY, getExpert, listExperts, type ExpertProfile } from './expert-profile';

/** Подписка на демо-правки: превью в соседней вкладке обновляется сразу после сохранения в админке */
function useDraftsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === EXPERT_DRAFTS_STORAGE_KEY) bump();
    };
    window.addEventListener(EXPERT_DRAFTS_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EXPERT_DRAFTS_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return version;
}

export function useExpert(slug: string | undefined): ExpertProfile | null {
  useDraftsVersion();
  return slug ? getExpert(slug) : null;
}

export function useExperts(): ExpertProfile[] {
  useDraftsVersion();
  return listExperts();
}
