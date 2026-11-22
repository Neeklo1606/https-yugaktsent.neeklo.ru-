import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, MapPin, Phone } from 'lucide-react';
import FavoritesBadgeIcon from '@/redesign/components/FavoritesBadgeIcon';
import { cn } from '@/lib/utils';

const TAB_CLASS =
  'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors';

/** Разделы нижнего меню; «Избранное» со счётчиком — между картой и контактами (20.11, как у Аякса) */
const TABS = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/catalog', label: 'Каталог', icon: LayoutGrid },
  { to: '/map', label: 'Карта', icon: MapPin },
  { to: '/favorites', label: 'Избранное', icon: null },
  { to: '/contacts', label: 'Контакты', icon: Phone },
] as const;

/**
 * Нижняя навигация для телефонов: прячется при скролле вниз
 * и возвращается при скролле вверх, чтобы не съедать экран.
 * Высота = --mobile-nav-h + safe-area; страницы резервируют её через .pb-mobile-nav.
 */
const MobileTabBar = () => {
  const location = useLocation();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      // Малые колебания игнорируем, иначе панель дрожит
      if (Math.abs(delta) < 8) return;
      setHidden(delta > 0 && y > 80);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md',
        'pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-200',
        hidden && 'translate-y-[calc(100%+env(safe-area-inset-bottom,0px))]',
      )}
    >
      <div className="grid h-[var(--mobile-nav-h)] grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={cn(TAB_CLASS, 'press', active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {/* Активная вкладка — «пилюля» за иконкой, как в нативных приложениях */}
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,transform] duration-200',
                  active ? 'scale-100 bg-gradient-to-br from-primary/15 to-primary/5' : 'scale-90 bg-transparent',
                )}
              >
                {Icon ? (
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                ) : (
                  <FavoritesBadgeIcon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileTabBar;
