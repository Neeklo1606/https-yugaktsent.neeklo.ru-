import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { btnClass } from '@/redesign/lib/button-styles';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { readAnalyticsConsent, writeAnalyticsConsent } from '@/shared/lib/analytics-consent';

export const COOKIE_NOTICE_STORAGE_KEY = 'yug_cookie_notice_v1';

function alreadyAccepted(): boolean {
  try {
    return localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const BANNER_ATTR = 'data-cookie-banner';

/**
 * Высота стопки закреплённых снизу панелей (нижнее меню, панель «Позвонить / Записаться»):
 * идём снизу вверх точками экрана и собираем fixed-элементы, прижатые друг к другу.
 * Страницы панели не размечают — меряем то, что реально на экране.
 */
function measureBottomStack(): number {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return 0;
  const vh = window.innerHeight;
  const x = Math.round(window.innerWidth / 2);
  let top = vh;
  for (let step = 0; step < 4; step += 1) {
    const probeY = top - 2;
    if (probeY <= vh / 2) break;
    let found: number | null = null;
    for (const el of document.elementsFromPoint(x, probeY)) {
      if (el.closest(`[${BANNER_ATTR}]`)) continue;
      let node: Element | null = el;
      while (node && node !== document.body) {
        if (getComputedStyle(node).position === 'fixed') break;
        node = node.parentElement;
      }
      if (!node || node === document.body) continue;
      const r = node.getBoundingClientRect();
      // Панель: прижата к низу стопки и не во весь экран (не шторка и не оверлей)
      if (r.bottom >= top - 4 && r.height < vh / 3 && r.top < top) {
        found = Math.min(found ?? r.top, r.top);
      }
    }
    if (found == null) break;
    top = found;
  }
  return Math.max(0, Math.round(vh - top));
}

/**
 * Уведомление о cookie (152-ФЗ): один раз, компактной полосой над нижними панелями
 * (меню, кнопки заявки) — ничего не перекрывает.
 * z-40 — ниже шторок и диалогов (z-50), иначе баннер закрывал кнопки в шторке параметров.
 * В служебном разделе не показывается.
 */
const CookieBanner = () => {
  const { pathname } = useLocation();
  const { data: settings } = useSiteSettings();
  // Счётчик задан в «Интеграциях» — нужен выбор: аналитика только с согласия
  const analytics = Boolean(settingOptional(settings, 'yandex_metrika_id'));
  const [noticeSeen, setNoticeSeen] = useState(alreadyAccepted());
  const [consent, setConsent] = useState(readAnalyticsConsent);
  const visible = analytics ? consent === null : !noticeSeen;
  const [stackH, setStackH] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setStackH(measureBottomStack()));
    };
    // Панели появляются после загрузки данных и прячутся при прокрутке — пересчитываем
    const timers = [0, 400, 1500, 4000].map((ms) => window.setTimeout(update, ms));
    let scrollTimer = 0;
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(update, 260);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(scrollTimer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll);
    };
  }, [visible, pathname]);

  if (!visible || pathname.startsWith('/admin') || pathname === '/login') return null;

  const accept = (choice: 'yes' | 'no' = 'yes') => {
    try {
      localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, '1');
    } catch {
      /* приватный режим: просто скрываем до перезагрузки */
    }
    setNoticeSeen(true);
    if (analytics) {
      writeAnalyticsConsent(choice);
      setConsent(choice);
    }
  };

  return (
    <div
      role="region"
      aria-label="Уведомление о cookie"
      {...{ [BANNER_ATTR]: '' }}
      style={stackH != null && (stackH > 0 || window.innerWidth < 1024) ? { bottom: stackH + 8 } : undefined}
      className="fixed inset-x-2 bottom-mobile-nav z-40 mx-auto flex max-w-[640px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-raised backdrop-blur-sm transition-[bottom] duration-200 sm:flex-nowrap sm:px-4 lg:bottom-6"
    >
      <p className="min-w-0 flex-1 basis-full text-[12px] leading-snug text-foreground sm:basis-auto sm:text-[13px]">
        {analytics
          ? 'Cookie помнят избранное и город, Метрика считает визиты — с вашего согласия.'
          : 'Cookie нужны, чтобы помнить избранное и город.'}{' '}
        <Link to="/cookies" className="text-primary underline underline-offset-2">Подробнее</Link>
      </p>
      {analytics ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => accept('no')} className={btnClass('ghost', { size: 'sm', className: 'h-8 px-3' })}>
            Только нужные
          </button>
          <button type="button" onClick={() => accept('yes')} className={btnClass('primary', { size: 'sm', className: 'h-8 px-4' })}>
            Принять
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => accept()} className={btnClass('primary', { size: 'sm', className: 'ml-auto h-8 shrink-0 px-4' })}>
          Понятно
        </button>
      )}
    </div>
  );
};

export default CookieBanner;
