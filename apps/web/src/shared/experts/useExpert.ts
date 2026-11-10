import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import {
  EXPERTS_ADMIN_PATH,
  EXPERTS_PUBLIC_PATH,
  EXPERT_SEED,
  getExpert,
  resolveExperts,
  type ExpertProfile,
  type ExpertsResponse,
} from './expert-profile';

export const expertsQueryKeys = {
  public: ['content', 'experts'] as const,
  admin: ['admin', 'content', 'experts'] as const,
};

/**
 * Публичный список экспертов из API. Пока ответа нет или API недоступен —
 * встроенные данные заказчика, чтобы страница и QR-коды работали всегда.
 */
export function useExpertsQuery(): { experts: ExpertProfile[]; isPending: boolean } {
  const q = useQuery({
    queryKey: expertsQueryKeys.public,
    queryFn: () => apiGet<ExpertsResponse>(EXPERTS_PUBLIC_PATH),
    staleTime: 60_000,
    retry: 1,
  });
  return { experts: q.isSuccess ? resolveExperts(q.data) : EXPERT_SEED, isPending: q.isPending };
}

export function useExpert(slug: string | undefined): ExpertProfile | null {
  const { experts } = useExpertsQuery();
  return slug ? getExpert(slug, experts) : null;
}

export function useExperts(): ExpertProfile[] {
  return useExpertsQuery().experts;
}

/* ─── Админка ─── */

/** Полный список для редактора (со скрытыми ссылками и черновиками). saved=false — на сервере ещё пусто. */
export function useAdminExperts() {
  const q = useQuery({
    queryKey: expertsQueryKeys.admin,
    queryFn: () => apiGet<ExpertsResponse>(EXPERTS_ADMIN_PATH),
  });
  return {
    ...q,
    experts: q.isSuccess ? resolveExperts(q.data) : null,
    saved: Array.isArray(q.data?.experts),
    updatedAt: q.data?.updatedAt ?? null,
  };
}

export function useSaveExperts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (experts: ExpertProfile[]) => apiPut<ExpertsResponse>(EXPERTS_ADMIN_PATH, { experts }),
    onSuccess: (data) => {
      qc.setQueryData(expertsQueryKeys.admin, data);
      void qc.invalidateQueries({ queryKey: expertsQueryKeys.public });
    },
  });
}
