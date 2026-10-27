import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * true, как только элемент впервые подошёл к экрану (и больше не сбрасывается).
 * Нужен, чтобы тяжёлые виджеты (карта) не грузились, пока их никто не видит.
 */
export function useInViewOnce(ref: RefObject<Element | null>, rootMargin = '400px'): boolean {
  const [seen, setSeen] = useState(false);
  const observer = useRef<{ el: Element; io: IntersectionObserver } | null>(null);

  // Без массива зависимостей: элемент часто появляется позже первого рендера
  // (страница ещё грузит данные). Раньше эффект срабатывал один раз с пустым ref
  // и больше не подписывался — карта ЖК так и не загружалась.
  // Наблюдатель создаётся один раз на элемент, а не на каждый рендер.
  // Зацикливания нет: setSeen срабатывает один раз, дальше эффект выходит по `seen`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el || observer.current?.el === el) return;
    observer.current?.io.disconnect();
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin },
    );
    io.observe(el);
    observer.current = { el, io };
  });

  useEffect(() => {
    if (seen) observer.current?.io.disconnect();
  }, [seen]);

  useEffect(() => () => observer.current?.io.disconnect(), []);

  return seen;
}
