import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  /** Колонки сетки на десктопе (от 1024 px) */
  desktopCols?: 2 | 3 | 4;
  /** Колонки на широком экране (от 1280 px); по умолчанию как desktopCols */
  wideCols?: 2 | 3 | 4;
  label: string;
  /** Узкие карточки (квартиры): на телефоне видно полторы, на планшете три */
  compact?: boolean;
  className?: string;
};

/**
 * Горизонтальная лента карточек на телефоне и сетка на десктопе.
 * Ширина карточки 90% контента — соседняя выглядывает намеренно (~10% экрана), с прилипанием;
 * поле контейнера сохранено через scroll-padding, чтобы первая карточка не липла к краю.
 */
const SnapRail = ({ children, desktopCols = 3, wideCols, label, compact = false, className }: Props) => (
  <div className={cn('-mx-4 sm:-mx-5 lg:mx-0', className)}>
    <ul
      aria-label={label}
      className={cn(
        'relative flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 scrollbar-hide sm:scroll-px-5 sm:px-5',
        'lg:grid lg:snap-none lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0',
        desktopCols === 2 && 'lg:grid-cols-2',
        desktopCols === 3 && 'lg:grid-cols-3',
        desktopCols === 4 && 'lg:grid-cols-4',
        wideCols === 2 && 'xl:grid-cols-2',
        wideCols === 3 && 'xl:grid-cols-3',
        wideCols === 4 && 'xl:grid-cols-4',
      )}
    >
      {Children.map(children, (child) => (
        <li
          className={cn(
            'shrink-0 snap-start lg:w-auto lg:min-w-0 lg:max-w-none',
            compact ? 'w-[64%] max-w-[280px] sm:w-[31%]' : 'w-[86%] max-w-[360px] sm:w-[46%]',
          )}
        >
          {child}
        </li>
      ))}
    </ul>
  </div>
);

export default SnapRail;
