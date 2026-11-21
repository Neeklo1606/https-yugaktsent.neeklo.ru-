import { useState } from 'react';
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

/**
 * Уведомление о cookie (152-ФЗ): один раз, над нижним меню на телефоне.
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
      className="fixed inset-x-3 bottom-mobile-nav mb-2 z-40 mx-auto flex max-w-[560px] items-center gap-3 rounded-card border border-border bg-card px-3 py-2 shadow-raised sm:px-4 sm:py-3 lg:bottom-6 lg:mb-0"
    >
      <p className="flex-1 text-[12px] leading-snug text-foreground sm:text-[13px]">
        {analytics
          ? 'Cookie помнят избранное и город, а Яндекс Метрика — считает посещения, если вы разрешите.'
          : 'Cookie нужны, чтобы помнить избранное и город.'}{' '}
        <Link to="/cookies" className="text-primary underline underline-offset-2">Подробнее</Link>
      </p>
      {analytics ? (
        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
          <button type="button" onClick={() => accept('yes')} className={btnClass('primary', { size: 'sm' })}>
            Принять
          </button>
          <button type="button" onClick={() => accept('no')} className={btnClass('ghost', { size: 'sm' })}>
            Только нужные
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => accept()} className={btnClass('primary', { size: 'sm', className: 'shrink-0' })}>
          Понятно
        </button>
      )}
    </div>
  );
};

export default CookieBanner;
