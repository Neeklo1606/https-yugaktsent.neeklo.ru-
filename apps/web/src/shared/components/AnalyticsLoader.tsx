import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { ANALYTICS_CONSENT_EVENT, readAnalyticsConsent } from '@/shared/lib/analytics-consent';
import { collectWebVitals } from '@/shared/lib/web-vitals';

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[]; l?: number };
declare global {
  interface Window {
    ym?: Ym;
  }
}

/**
 * Яндекс Метрика из «Интеграций» (номер счётчика — настройка yandex_metrika_id).
 * Грузится только после согласия на аналитические cookie и после загрузки страницы + простоя —
 * не отнимает время у первого экрана (раньше Метрика давала половину блокировки потока на телефоне).
 * Если счётчик уже вставлен иначе (панель хостинга), второй не ставим.
 */
export default function AnalyticsLoader() {
  const { data: settings } = useSiteSettings();
  const raw = settingOptional(settings, 'yandex_metrika_id');
  const id = raw && /^\d{5,12}$/.test(raw) ? Number(raw) : null;
  const [consent, setConsent] = useState(readAnalyticsConsent);
  const loaded = useRef(false);
  const { pathname, search } = useLocation();

  useEffect(() => {
    const on = () => setConsent(readAnalyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, on);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, on);
  }, []);

  useEffect(() => {
    if (!id || consent !== 'yes' || loaded.current || pathname.startsWith('/admin')) return;
    if (typeof window.ym === 'function') {
      loaded.current = true;
      return;
    }
    const start = () => {
      if (loaded.current) return;
      loaded.current = true;
      const ym: Ym = function (...args: unknown[]) {
        (ym.a = ym.a || []).push(args);
      } as Ym;
      ym.l = Date.now();
      window.ym = ym;
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://mc.yandex.ru/metrika/tag.js';
      document.head.appendChild(s);
      window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, defer: true });
      window.ym(id, 'hit', window.location.href, { referer: document.referrer });
    };
    const idle = () =>
      'requestIdleCallback' in window
        ? (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback(start, { timeout: 4000 })
        : globalThis.setTimeout(start, 2500);
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
  }, [id, consent, pathname]);

  // Скорость у реальных посетителей → параметры визита Метрики (только при согласии и своём счётчике)
  useEffect(() => {
    if (!id || consent !== 'yes') return;
    return collectWebVitals((v, page) => {
      if (typeof window.ym === 'function') window.ym(id, 'params', { webVitals: { [page]: v } });
    });
  }, [id, consent]);

  // Переходы внутри приложения — отдельные просмотры (defer: true выключил авто-хит)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (id && loaded.current && typeof window.ym === 'function') window.ym(id, 'hit', window.location.href);
  }, [id, pathname, search]);

  return null;
}
