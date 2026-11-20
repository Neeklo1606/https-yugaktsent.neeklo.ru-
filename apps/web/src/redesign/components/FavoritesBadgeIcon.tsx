import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavorites } from '@/shared/hooks/useFavorites';

/** Сердце со счётчиком избранного — для шапки и нижнего меню. */
const FavoritesBadgeIcon = ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) => {
  const { count } = useFavorites();
  return (
    <span className="relative inline-flex">
      <Heart className={cn('h-[18px] w-[18px]', className)} strokeWidth={strokeWidth} aria-hidden />
      {count > 0 ? (
        <span
          className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground"
          aria-hidden
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </span>
  );
};

export default FavoritesBadgeIcon;
