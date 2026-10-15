import { useLanguage, type Dictionary } from './LanguageProvider';

type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${NestedKeyOf<T[K]>}`
    : K;
}[keyof T & string];

export type TKey = NestedKeyOf<Dictionary>;

function lookup(dict: Dictionary, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc === 'object' && acc !== null && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

/** Typed translation accessor with {var} interpolation. */
export function useT(): { t: (key: TKey, vars?: Record<string, string | number>) => string; locale: ReturnType<typeof useLanguage>['locale'] } {
  const { dict, locale } = useLanguage();
  const t = (key: TKey, vars?: Record<string, string | number>): string => {
    const raw = lookup(dict, key);
    const text = typeof raw === 'string' ? raw : key;
    if (!vars) return text;
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.split(`{${k}}`).join(String(v)),
      text,
    );
  };
  return { t, locale };
}
