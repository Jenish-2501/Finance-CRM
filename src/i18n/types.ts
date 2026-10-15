export type Locale = 'en' | 'gu';

export const LOCALES: Record<Locale, { label: string; nativeLabel: string }> = {
  en: { label: 'English', nativeLabel: 'English' },
  gu: { label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
};

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'acculedger-locale';
