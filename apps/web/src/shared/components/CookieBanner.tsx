import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { btnClass } from '@/redesign/lib/button-styles';

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
 * В служебном разделе не показывается.
 */
const CookieBanner = () => {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(alreadyAccepted() === false);
  if (!visible || pathname.startsWith('/admin') || pathname === '/login') return null;

  const accept = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, '1');
    } catch {
      /* приватный режим: просто скрываем до перезагрузки */
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Уведомление о cookie"
      className="fixed inset-x-3 bottom-mobile-nav mb-2 z-[90] mx-auto flex max-w-[560px] items-center gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-raised lg:bottom-6 lg:mb-0"
    >
      <p className="flex-1 text-[13px] leading-snug text-foreground">
        Сайт использует cookie, чтобы помнить избранное и город.{' '}
        <Link to="/cookies" className="text-primary underline underline-offset-2">Подробнее</Link>
      </p>
      <button type="button" onClick={accept} className={btnClass('primary', { size: 'sm', className: 'shrink-0' })}>
        Понятно
      </button>
    </div>
  );
};

export default CookieBanner;
