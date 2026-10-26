import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  /** Колонки сетки на десктопе */
  desktopCols?: 2 | 3 | 4;
  label: string;
  className?: string;
};

/**
 * Горизонтальная лента карточек на телефоне и сетка на десктопе.
 * Ширина карточки 86% — соседняя выглядывает намеренно (~10%), с прилипанием;
 * поле контейнера сохранено через scroll-padding, чтобы первая карточка не липла к краю.
 */
const SnapRail = ({ children, desktopCols = 3, label, className }: Props) => (
  <div className={cn('-mx-4 sm:-mx-5 lg:mx-0', className)}>
    <ul
      aria-label={label}
      className={cn(
        'flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 scrollbar-hide sm:scroll-px-5 sm:px-5',
        'lg:grid lg:snap-none lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0',
        desktopCols === 2 && 'lg:grid-cols-2',
        desktopCols === 3 && 'lg:grid-cols-3',
        desktopCols === 4 && 'lg:grid-cols-4',
      )}
    >
      {Children.map(children, (child) => (
        <li className="w-[86%] max-w-[360px] shrink-0 snap-start sm:w-[46%] lg:w-auto lg:max-w-none">{child}</li>
      ))}
    </ul>
  </div>
);

export default SnapRail;
