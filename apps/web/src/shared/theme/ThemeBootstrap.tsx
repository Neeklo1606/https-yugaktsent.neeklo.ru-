import { useEffect } from 'react';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import {
  THEME_DRAFT_STORAGE_KEY,
  THEME_SETTING_KEY,
  applyThemeOverrides,
  parseThemeOverrides,
  readThemeDraft,
} from './theme-engine';

/**
 * Применяет опубликованную тему из настроек сайта, а в браузере редактора —
 * черновик предпросмотра из Theme Builder. Ничего не рендерит.
 */
const ThemeBootstrap = () => {
  const { data: settings } = useSiteSettings();
  const published = settingOptional(settings, THEME_SETTING_KEY);

  useEffect(() => {
    const apply = () => applyThemeOverrides(readThemeDraft() ?? parseThemeOverrides(published));
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_DRAFT_STORAGE_KEY) apply();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('yug:theme-draft', apply);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('yug:theme-draft', apply);
    };
  }, [published]);

  return null;
};

export default ThemeBootstrap;
