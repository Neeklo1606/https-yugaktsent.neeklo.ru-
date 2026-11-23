import { MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { YandexMapsFailure } from '@/shared/hooks/useYandexMapsReady';

type Props = {
  failure: Exclude<YandexMapsFailure, null>;
  className?: string;
};

/**
 * Показывается вместо карты, когда Яндекс.Карты не поднялись.
 * Молчать и крутить спиннер вечно — худший вариант: список объектов рядом работает.
 */
const MapUnavailableNotice = ({ failure, className }: Props) => (
  <div
    className={cn(
      'absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 rounded-xl bg-muted/90 px-6 text-center',
      className,
    )}
    role="status"
  >
    <MapPinOff className="h-7 w-7 text-muted-foreground" aria-hidden />
    <p className="text-sm font-medium text-foreground">Карта недоступна</p>
    <p className="max-w-[320px] text-xs leading-relaxed text-muted-foreground">
      {failure === 'no-key'
        ? 'Не задан ключ Яндекс.Карт. Его добавляют в админке: Настройки сайта → группа «integrations».'
        : 'Не удалось загрузить Яндекс.Карты. Проверьте соединение и ключ в настройках сайта.'}
    </p>
    <p className="text-xs text-muted-foreground">Список объектов рядом работает без карты.</p>
  </div>
);

export default MapUnavailableNotice;
