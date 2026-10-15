import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { LOCALES } from './types';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { locale, toggleLocale } = useLanguage();
  const next = locale === 'en' ? LOCALES.gu : LOCALES.en;
  return (
    <button
      onClick={toggleLocale}
      title={`Switch to ${next.label}`}
      aria-label={`Switch to ${next.label}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card text-foreground border border-border rounded-md hover:bg-muted transition-colors ${className}`}
    >
      <Languages className="w-3.5 h-3.5" />
      <span>{next.nativeLabel}</span>
    </button>
  );
};
