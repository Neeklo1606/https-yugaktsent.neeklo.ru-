import { createElement, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'li' | 'article';
  children: ReactNode;
  /** Задержка появления, мс — для лесенки карточек */
  delay?: number;
};

/**
 * Мягкое появление блока при прокрутке: прозрачность + подъём на 14 px, один раз.
 * Только opacity/transform (без перерасчёта вёрстки); при «уменьшить движение» в системе — без анимации (index.css).
 * На сервере (пререндер) блок сразу видим, чтобы HTML для роботов не был прозрачным.
 */
export default function Reveal({ as = 'div', children, className, delay = 0, style, ...rest }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(() => typeof window === 'undefined' || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: cn('reveal', shown && 'is-shown', className),
      style: delay ? { ...style, transitionDelay: `${delay}ms` } : style,
    },
    children,
  );
}
