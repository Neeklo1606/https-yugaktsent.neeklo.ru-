import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { prefetchRoute } from '@/shared/lib/route-prefetch';
import { apiGet, apiGetOrNull } from '@/lib/api';

/**
 * «Как приложение» на телефоне (см. README рядом):
 * - PageEnter — мягкое появление новой страницы (180 мс, только прозрачность); «Назад» — без анимации;
 * - NavProgress — тонкая полоса сверху, только если переход дольше 150 мс;
 * - useIntentPrefetch — код страницы начинает грузиться в момент касания ссылки, до отпускания пальца.
 */

function internalPath(target: EventTarget | null): string | null {
  const a = (target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
  const href = a.getAttribute('href') || '';
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

/**
 * Данные главного запроса страницы — тоже по касанию: ключи совпадают с RedesignComplex
 * (['block','slug',slug]) и RedesignApartment (['listing','detail',id]). Пока палец на экране
 * (~100 мс) запрос уже идёт; страница открывается с готовыми данными.
 */
function prefetchData(qc: QueryClient, path: string) {
  const complex = /^\/complex\/([^/?#]+)/.exec(path);
  if (complex) {
    let slug = complex[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* как есть */
    }
    void qc.prefetchQuery({
      queryKey: ['block', 'slug', slug],
      queryFn: () => apiGetOrNull(`/blocks/${encodeURIComponent(slug)}`),
      staleTime: 600_000,
    });
    return;
  }
  const apt = /^\/apartment\/(\d+)/.exec(path);
  if (apt) {
    const id = Number(apt[1]);
    void qc.prefetchQuery({ queryKey: ['listing', 'detail', id], queryFn: () => apiGet(`/listings/${id}`), staleTime: 60_000 });
  }
}

/** Предзагрузка кода и данных страницы по намерению: касание, нажатие мышью, фокус с клавиатуры */
export function useIntentPrefetch() {
  const qc = useQueryClient();
  useEffect(() => {
    const onIntent = (e: Event) => {
      const path = internalPath(e.target);
      if (!path) return;
      const clean = path.split(/[?#]/)[0];
      prefetchRoute(clean);
      prefetchData(qc, clean);
    };
    document.addEventListener('pointerdown', onIntent, { passive: true, capture: true });
    document.addEventListener('focusin', onIntent, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onIntent, { capture: true });
      document.removeEventListener('focusin', onIntent);
    };
  }, [qc]);
}

/** Полоса перехода: стартует по клику на внутреннюю ссылку, видна только при ожидании > 150 мс */
export function NavProgress() {
  const location = useLocation();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const timer = useRef<number>();
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const path = internalPath(e.target);
      if (!path) return;
      const current = window.location.pathname + window.location.search;
      if (path === current || path.startsWith('#')) return;
      startedFor.current = current;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPhase('running'), 150);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Новая страница показана — дотягиваем полосу и прячем
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (startedFor.current == null) return;
    startedFor.current = null;
    setPhase((p) => (p === 'running' ? 'done' : 'idle'));
    const t = window.setTimeout(() => setPhase('idle'), 320);
    return () => window.clearTimeout(t);
  }, [location.key]);

  // Страховка: переход не случился (ошибка, отмена) — не висим
  useEffect(() => {
    if (phase !== 'running') return;
    const t = window.setTimeout(() => setPhase('idle'), 10000);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'idle') return null;
  return (
    <div
      className="nav-progress"
      aria-hidden
      style={{
        transform: phase === 'running' ? 'scaleX(0.8)' : 'scaleX(1)',
        opacity: phase === 'done' ? 0 : 1,
      }}
      ref={(el) => {
        // Стартуем с нуля, затем растягиваем до 80 % — плавно, без рывка
        if (el && phase === 'running' && !el.dataset.started) {
          el.dataset.started = '1';
          el.style.transform = 'scaleX(0)';
          void el.offsetWidth;
          el.style.transform = 'scaleX(0.8)';
        }
      }}
    />
  );
}

/**
 * Обёртка страниц: мягкое появление при переходе вперёд; первая загрузка и «Назад» — без анимации.
 * Анимацию перезапускаем через класс, без смены key: дерево страниц не пересоздаётся.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const ref = useRef<HTMLDivElement>(null);
  const prevPath = useRef(location.pathname);

  useLayoutEffect(() => {
    const pathChanged = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;
    const el = ref.current;
    if (!el || !pathChanged || navType === 'POP' || location.pathname.startsWith('/admin')) return;
    el.classList.remove('page-enter');
    void el.offsetWidth;
    el.classList.add('page-enter');
  }, [location.key, location.pathname, navType]);

  return (
    <div ref={ref} onAnimationEnd={(e) => (e.target as Element).tagName === 'MAIN' && e.currentTarget.classList.remove('page-enter')}>
      {children}
    </div>
  );
}
