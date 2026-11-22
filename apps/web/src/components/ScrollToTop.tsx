import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Прокрутка как в приложении:
 * - переход по ссылке — к началу страницы (якорь `#id` — к блоку);
 * - «Назад»/«Вперёд» — на то же место, где человек был. Данные приходят с сервера не сразу,
 *   поэтому позицию докручиваем, пока страница не станет достаточно длинной (до 2 с).
 * Позиции хранятся в sessionStorage по ключу записи истории.
 */
const STORE_KEY = 'yug_scroll_v1';

function readStore(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function savePosition(key: string, y: number) {
  try {
    const store = readStore();
    store[key] = Math.round(y);
    // Храним последние 50 записей
    const keys = Object.keys(store);
    if (keys.length > 50) delete store[keys[0]];
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* приватный режим — без восстановления */
  }
}

const ScrollToTop = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef<string | null>(null);
  /** Ключ записи, которая сейчас на экране: старый обработчик прокрутки не должен записать 0 при уходе */
  const activeKey = useRef(location.key);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  // Запоминаем позицию текущей записи истории при прокрутке
  useEffect(() => {
    const key = location.key;
    let t = 0;
    const onScroll = () => {
      window.clearTimeout(t);
      // Таймер, а не rAF: rAF не срабатывает во вкладке в фоне, и позиция терялась
      t = window.setTimeout(() => {
        if (activeKey.current === key) savePosition(key, window.scrollY);
      }, 80);
    };
    // Надёжно: позицию фиксируем и в момент ухода — нажатие ссылки или кнопки «назад» в интерфейсе
    const saveNow = () => {
      if (activeKey.current === key) savePosition(key, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', saveNow, true);
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', saveNow, true);
      window.removeEventListener('pagehide', saveNow);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    activeKey.current = location.key;
    const pathChanged = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;
    if (navType === 'POP') {
      const target = readStore()[location.key];
      if (target == null || target <= 0) return;
      const started = performance.now();
      let raf = 0;
      const tryRestore = () => {
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.min(target, maxY));
        if (maxY >= target - 2 || performance.now() - started > 2000) return;
        raf = window.setTimeout(tryRestore, 50);
      };
      tryRestore();
      // Пользователь сам начал листать — не мешаем
      const stop = () => window.clearTimeout(raf);
      window.addEventListener('wheel', stop, { once: true, passive: true });
      window.addEventListener('touchstart', stop, { once: true, passive: true });
      return () => {
        window.clearTimeout(raf);
        window.removeEventListener('wheel', stop);
        window.removeEventListener('touchstart', stop);
      };
    }
    if (location.hash) {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    // Смена фильтров в каталоге (меняется только ?query) не должна кидать наверх
    if (pathChanged) window.scrollTo(0, 0);
  }, [location.key, location.pathname, location.hash, navType]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

export default ScrollToTop;
