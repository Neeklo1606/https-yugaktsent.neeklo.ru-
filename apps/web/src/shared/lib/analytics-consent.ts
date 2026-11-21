/** Согласие на аналитические cookie (152-ФЗ): 'yes' | 'no' | null — ещё не спрашивали */
export const ANALYTICS_CONSENT_KEY = 'yug_cookie_analytics_v1';
export const ANALYTICS_CONSENT_EVENT = 'yug-analytics-consent';

export function readAnalyticsConsent(): 'yes' | 'no' | null {
  try {
    const v = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(v: 'yes' | 'no') {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, v);
  } catch {
    /* приватный режим */
  }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: v }));
}
