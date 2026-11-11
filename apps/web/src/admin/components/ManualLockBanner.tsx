import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Unlock } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';

const LABELS: Record<string, string> = {
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

export const manualFieldsLabel = (fields: string[]) => fields.map((f) => LABELS[f] ?? f).join(', ');

/**
 * Поля объявления, изменённые вручную: синхронизация фида их не перезаписывает.
 * Кнопка возвращает управление фиду — при следующем прогоне значения придут из выгрузки.
 */
export default function ManualLockBanner({ listingId, fields }: { listingId: number; fields: string[] }) {
  const qc = useQueryClient();
  const release = useMutation({
    mutationFn: () => apiPost(`/admin/listings/${listingId}/release-manual`, {}),
    onSuccess: async () => {
      toast.success('Управление возвращено фиду — значения обновятся при следующей синхронизации');
      await qc.invalidateQueries({ queryKey: ['listing'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось снять закрепление'),
  });

  if (!fields.length) return null;
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Изменено вручную: {manualFieldsLabel(fields)}</p>
        <p className="mt-0.5 text-amber-900/80">Синхронизация фида эти поля не перезаписывает, остальные обновляет как обычно.</p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={release.isPending} onClick={() => release.mutate()}>
        <Unlock className="mr-1.5 h-4 w-4" aria-hidden />
        Вернуть управление фиду
      </Button>
    </div>
  );
}
