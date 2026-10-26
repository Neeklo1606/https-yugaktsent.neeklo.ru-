import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

/**
 * Акцент бренда в hex — для мест, где нельзя подставить CSS-переменную:
 * разметка меток Яндекс.Карт, canvas, инлайновые SVG.
 * Держать в соответствии с `--primary` в index.css (#165447) и `--focus` (#3D907D).
 */
export const BRAND_PRIMARY_HEX = '#165447';
/** Тот же акцент светлее — для активного состояния на карте */
export const BRAND_PRIMARY_ACTIVE_HEX = '#3D907D';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'inverseOutline';
export type ButtonSize = 'md' | 'sm';

export function btnClass(
  variant: ButtonVariant,
  opts?: { block?: boolean; size?: ButtonSize; className?: string },
): string {
  const size = opts?.size ?? 'md';
  return cn(
    buttonVariants({ variant, size: size === 'sm' ? 'sm' : 'md' }),
    opts?.block && 'w-full sm:w-auto',
    opts?.className,
  );
}
