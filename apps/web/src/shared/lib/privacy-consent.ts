/** Shared validation for mandatory privacy consent on PII forms. */

/**
 * Дата редакции текста «Согласие на обработку персональных данных» (/personal-data-consent).
 * Уходит с каждой заявкой и хранится в базе — так видно, какой текст принял посетитель.
 * Меняется вместе с текстом согласия.
 */
export const PD_CONSENT_VERSION = '2026-11-11';

export const PRIVACY_CONSENT_ERROR =
  'Отметьте согласие на обработку персональных данных';

export function isPrivacyConsentAccepted(accepted: boolean): boolean {
  return accepted === true;
}

/** Returns error message when consent is missing, otherwise null. */
export function validatePrivacyConsent(accepted: boolean): string | null {
  return isPrivacyConsentAccepted(accepted) ? null : PRIVACY_CONSENT_ERROR;
}

/** Поля согласия для тела POST /requests */
export function consentPayload() {
  return { consent: true as const, consentVersion: PD_CONSENT_VERSION };
}
