import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale } from './types';
import { en } from './en';
import { gu } from './gu';
import { applyOverrides, loadGuOverrides, type OverrideMap } from './overrides';

export type Dictionary = typeof en;

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'gu') return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  /** Raw dictionary for the active locale (prefer useT for typed access). */
  dict: Dictionary;
  /** Admin-customized Gujarati wording ({ "nav.dashboard": "…" }). */
  guOverrides: OverrideMap;
  /** Re-read overrides from the database (e.g. after editing in Settings). */
  refreshGuOverrides: () => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  toggleLocale: () => {},
  dict: en,
  guOverrides: {},
  refreshGuOverrides: async () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [guOverrides, setGuOverrides] = useState<OverrideMap>({});

  const refreshGuOverrides = useCallback(async () => {
    const next = await loadGuOverrides();
    setGuOverrides(next);
  }, []);

  // Stored customizations merge OVER the bundled gu.ts at boot — an admin
  // edit in Settings → Language takes effect on the next refresh/reload.
  useEffect(() => {
    void refreshGuOverrides();
  }, [refreshGuOverrides]);

  useEffect(() => {
    document.documentElement.lang = locale === 'gu' ? 'gu' : 'en';
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const toggleLocale = useCallback(() => setLocaleState((l) => (l === 'gu' ? 'en' : 'gu')), []);

  const dict = useMemo<Dictionary>(
    () => (locale === 'gu' ? applyOverrides(gu, guOverrides) : en),
    [locale, guOverrides]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, toggleLocale, dict, guOverrides, refreshGuOverrides }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
