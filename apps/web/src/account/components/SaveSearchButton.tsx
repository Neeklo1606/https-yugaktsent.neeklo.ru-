import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Loader2 } from 'lucide-react';
import { paramsFromUrlSearchParams, type SavedSearchParamsJson } from '@lg/shared';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  catalogFiltersIntoSearchParams,
} from '@/redesign/lib/catalog-url-sync';
import type { CatalogFilters } from '@/redesign/data/types';

type Props = {
  filters: CatalogFilters;
  regionId: number | null;
  geo?: {
    geo_lat?: number;
    geo_lng?: number;
    geo_radius_m?: number;
    geo_polygon?: string;
    geo_preset?: string;
  };
};

export default function SaveSearchButton({ filters, regionId, geo }: Props) {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (overwrite: boolean) => {
      const sp = catalogFiltersIntoSearchParams(new URLSearchParams(), filters);
      const paramsJson: SavedSearchParamsJson = {
        params: paramsFromUrlSearchParams(sp),
        regionId,
        geo: geo ?? null,
      };
      return apiPost('/account/saved-searches', {
        name: name.trim() || defaultName(filters),
        paramsJson,
        regionId: regionId ?? undefined,
        overwrite,
      });
    },
    onSuccess: () => {
      toast.success('Поиск сохранён');
      setOpen(false);
      setName('');
      void qc.invalidateQueries({ queryKey: ['account', 'saved-searches'] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        const overwrite = confirm('Такой поиск уже есть. Обновить?');
        if (overwrite) saveMutation.mutate(true);
        return;
      }
      toast.error(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    },
  });

  if (!isAuthenticated) return null;

  if (open) {
    return (
      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <input
          className="border rounded-xl px-3 h-9 text-sm min-w-[160px] flex-1"
          placeholder="Название поиска"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-9 min-h-[44px] flex-1 sm:flex-none"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(false)}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 min-h-[44px]" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 min-h-[44px] gap-1.5 max-sm:w-11 max-sm:px-0"
      onClick={() => setOpen(true)}
      aria-label="Сохранить поиск"
    >
      <Bookmark className="w-4 h-4" />
      {/* Телефон: только иконка — с текстом не помещалась сортировка («Снача…») */}
      <span className="hidden sm:inline">Сохранить поиск</span>
    </Button>
  );
}

function defaultName(filters: CatalogFilters): string {
  const parts: string[] = [];
  if (filters.search.trim()) parts.push(filters.search.trim());
  if (filters.priceMin) parts.push(`от ${Math.round(filters.priceMin / 1_000_000)} млн`);
  if (filters.rooms.length) parts.push(`${filters.rooms.join(',')} комн.`);
  return parts.join(' · ') || 'Мой поиск';
}
