import { useEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Резерв высоты, пока блок не собран: без него страница прыгала бы при прокрутке */
  minHeight: number;
};

/**
 * Нижние блоки страницы собираются не сразу, а когда до них остаётся ~экран прокрутки
 * или через ~5 с в свободную минуту браузера. На телефоне это снимает с первой загрузки
 * сборку всех секций до подвала — главная быстрее начинает отвечать на касания.
 * В пререндере (сервер) блок выводится сразу: поисковик видит весь текст.
 */
export default function DeferredSection({ children, minHeight }: Props) {
  const [show, setShow] = useState(typeof window === 'undefined');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    let idle = 0;
    const reveal = () => setShow(true);
    const io =
      el && 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && reveal(), { rootMargin: '900px 0px' })
        : null;
    if (io && el) io.observe(el);
    // Запасной путь: через 5 с, в свободную минуту браузера — чтобы «Ctrl+F» и якоря находили текст
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    idle = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(reveal, { timeout: 2000 }) : reveal()), 5000);
    return () => {
      io?.disconnect();
      window.clearTimeout(idle);
    };
  }, [show]);

  if (show) return <>{children}</>;
  return <div ref={ref} style={{ minHeight }} aria-hidden />;
}
