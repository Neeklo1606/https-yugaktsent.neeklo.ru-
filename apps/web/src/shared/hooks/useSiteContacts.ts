import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';

/**
 * Контакты и юридические реквизиты сайта из CMS.
 * Ничего не выдумываем: чего нет в настройках — возвращаем undefined,
 * страницы такие строки просто не рисуют.
 */
export function useSiteContacts() {
  const { data: settings } = useSiteSettings();
  const { shortName } = useSiteBrand();

  const publicUrl =
    settingOptional(settings, 'public_site_url') ??
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined);

  return {
    brandName: shortName,
    email: settingOptional(settings, 'email') ?? settingOptional(settings, 'contacts_email'),
    phone: settingOptional(settings, 'phone_main'),
    address: settingOptional(settings, 'address'),
    /** Юридическое лицо оператора, например «ООО Ромашка» */
    legalEntity: settingOptional(settings, 'legal_entity'),
    inn: settingOptional(settings, 'inn'),
    ogrn: settingOptional(settings, 'ogrn'),
    /** Юридический адрес оператора (если отличается от адреса офиса) */
    legalAddress: settingOptional(settings, 'legal_address'),
    /** Домен сайта без протокола — для юридических текстов */
    siteDomain: publicUrl?.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  };
}
