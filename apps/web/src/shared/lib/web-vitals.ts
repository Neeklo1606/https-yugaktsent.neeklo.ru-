/**
 * Полевые замеры скорости (Web Vitals) у реальных посетителей — без сторонних библиотек.
 * LCP, CLS, INP (самое долгое взаимодействие), FCP и TTFB копятся на странице и уходят
 * один раз, когда вкладку прячут или закрывают. Значения в мс (CLS — ×1000 для целого числа).
 */
export type WebVitals = { lcp?: number; cls?: number; inp?: number; fcp?: number; ttfb?: number };

export function collectWebVitals(onReport: (v: WebVitals, page: string) => void): () => void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return () => {};
  const v: WebVitals = {};
  const observers: PerformanceObserver[] = [];
  const watch = (type: string, cb: (entries: PerformanceEntryList) => void, extra: Record<string, unknown> = {}) => {
    try {
      const o = new PerformanceObserver((l) => cb(l.getEntries()));
      o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      observers.push(o);
    } catch {
      /* тип не поддерживается браузером */
    }
  };
  watch('largest-contentful-paint', (es) => {
    const last = es[es.length - 1];
    if (last) v.lcp = Math.round(last.startTime);
  });
  let cls = 0;
  watch('layout-shift', (es) => {
    for (const e of es as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) cls += e.value;
    v.cls = Math.round(cls * 1000);
  });
  watch(
    'event',
    (es) => {
      for (const e of es) v.inp = Math.max(v.inp ?? 0, Math.round(e.duration));
    },
    { durationThreshold: 40 },
  );
  watch('paint', (es) => {
    const fcp = es.find((e) => e.name === 'first-contentful-paint');
    if (fcp) v.fcp = Math.round(fcp.startTime);
  });
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav) v.ttfb = Math.round(nav.responseStart);

  const page = window.location.pathname.replace(/\/\d+(?=\/|$)/g, '/:id');
  let sent = false;
  const flush = () => {
    if (sent || document.visibilityState !== 'hidden') return;
    sent = true;
    onReport({ ...v }, page);
  };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);
  return () => {
    observers.forEach((o) => o.disconnect());
    document.removeEventListener('visibilitychange', flush);
    window.removeEventListener('pagehide', flush);
  };
}
