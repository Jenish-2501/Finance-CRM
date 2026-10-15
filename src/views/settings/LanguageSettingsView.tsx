import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Languages, RotateCcw, Search } from 'lucide-react';
import { ShellBadge } from '../../components/common/ShellBadge';
import {
  Alert,
  Button,
  Card,
  CardTitle,
  Input,
  Label,
  SearchInput,
  Select,
} from '../../components/ui';
import { en, gu, useLanguage, useT } from '../../i18n';
import {
  flattenDictionary,
  getByPath,
  loadGuOverrides,
  resetGuOverrides,
  saveGuOverrideDiff,
  type OverrideMap,
} from '../../i18n/overrides';

interface Row {
  key: string;
  section: string;
  english: string;
  bundled: string;
}

const ALL_SECTIONS = 'all';

function buildRows(): Row[] {
  const flat = flattenDictionary(en as unknown as Record<string, unknown>);
  return flat.map(({ key, value }) => {
    const bundled = getByPath(gu as unknown as Record<string, unknown>, key);
    return {
      key,
      section: key.split('.')[0],
      english: value,
      bundled: typeof bundled === 'string' ? bundled : '',
    };
  });
}

interface LanguageRowProps {
  rowKey: string;
  english: string;
  bundled: string;
  value: string;
  isCustom: boolean;
  isDirty: boolean;
  customLabel: string;
  bundledLabel: string;
  customPh: string;
  statusLabel: string;
  resetLabel: string;
  resetTitle: string;
  onDraft: (key: string, value: string) => void;
  onReset: (key: string) => void;
}

// Memoized: typing in one field must not re-render the other ~709 rows —
// that per-keystroke full-list re-render is what made this long page feel
// janky/frozen while scrolling and editing.
const LanguageRow = React.memo(function LanguageRow({
  rowKey,
  english,
  bundled,
  value,
  isCustom,
  isDirty,
  customLabel,
  bundledLabel,
  customPh,
  statusLabel,
  resetLabel,
  resetTitle,
  onDraft,
  onReset,
}: LanguageRowProps) {
  return (
    <Card className={`p-4 shadow-2xs ${isDirty ? 'border-primary/50' : ''}`}>
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="lg:w-2/5 space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <code className="text-[11px] font-mono font-semibold text-foreground break-all">{rowKey}</code>
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                isCustom
                  ? 'bg-primary/10 text-primary border-primary/25'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed break-words">{english}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed break-words">
            {bundledLabel}: {bundled}
          </p>
        </div>
        <div className="lg:w-3/5 flex items-start gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <Label className="mb-1 sr-only" htmlFor={`lang-${rowKey}`}>
              {customLabel} — {rowKey}
            </Label>
            <Input
              id={`lang-${rowKey}`}
              type="text"
              value={value}
              placeholder={bundled || customPh}
              onChange={(e) => onDraft(rowKey, e.target.value)}
              className="w-full"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onReset(rowKey)}
            disabled={!isCustom && value === bundled}
            title={resetTitle}
            className="mt-0 shrink-0"
          >
            {resetLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
});

/**
 * Language route under Settings: every UI string in one place.
 * English is the fixed source; the admin edits the Gujarati wording, which is
 * stored in the database (language_overrides table) and applied everywhere
 * the app runs in Gujarati. Clearing a custom value restores bundled wording.
 */
export const LanguageSettingsView: React.FC = () => {
  const { t } = useT();
  const { refreshGuOverrides } = useLanguage();
  // t() is recreated every render — memo-stable callbacks below read it
  // through a ref so row memoization isn't defeated.
  const tRef = useRef(t);
  tRef.current = t;

  const rows = useMemo(buildRows, []);
  const sections = useMemo(
    () => Array.from(new Set(rows.map((r) => r.section))).sort(),
    [rows]
  );
  const bundledByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.bundled;
    return m;
  }, [rows]);

  const [loaded, setLoaded] = useState<OverrideMap>({});
  const [drafts, setDrafts] = useState<OverrideMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<string>(ALL_SECTIONS);
  const [onlyCustomized, setOnlyCustomized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // Pagination keeps each view short so the page never needs long scrolling.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fixed-region layout switch: hidden bars + exact-fit flex column apply
  // only while this tab is mounted (removed on unmount, other tabs unaffected).
  useEffect(() => {
    document.body.classList.add('lang-tab-active');
    return () => document.body.classList.remove('lang-tab-active');
  }, []);

  // Effective value for a key: draft if edited in this session, else the
  // stored customization, else the bundled Gujarati.
  const effectiveOf = useCallback(
    (key: string, draftMap: OverrideMap, loadedMap: OverrideMap): string => {
      if (key in draftMap) return draftMap[key];
      if (key in loadedMap && loadedMap[key].trim().length > 0) return loadedMap[key];
      return bundledByKey[key] ?? '';
    },
    [bundledByKey]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const next = await loadGuOverrides();
        if (!cancelled) {
          setLoaded(next);
          setDrafts({});
        }
      } catch {
        if (!cancelled) setLoadError(tRef.current('languageSettings.saveError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const customizedCount = useMemo(
    () => Object.keys(loaded).filter((k) => loaded[k].trim().length > 0).length,
    [loaded]
  );

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const [k, v] of Object.entries(drafts)) {
      const wasCustom = k in loaded && loaded[k].trim().length > 0;
      const baseEff = wasCustom ? loaded[k] : (bundledByKey[k] ?? '');
      if (v !== baseEff) n += 1;
    }
    return n;
  }, [drafts, loaded, bundledByKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (section !== ALL_SECTIONS && r.section !== section) return false;
      if (onlyCustomized) {
        const custom = loaded[r.key];
        if (!custom || custom.trim().length === 0) return false;
      }
      if (!q) return true;
      const eff =
        r.key in drafts
          ? drafts[r.key]
          : r.key in loaded && loaded[r.key].trim().length > 0
            ? loaded[r.key]
            : r.bundled;
      return (
        r.key.toLowerCase().includes(q) ||
        r.english.toLowerCase().includes(q) ||
        r.bundled.toLowerCase().includes(q) ||
        eff.toLowerCase().includes(q)
      );
    });
  }, [rows, search, section, onlyCustomized, loaded, drafts]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  );

  // The rows live in their own fixed-height box; entering the tab, turning a
  // page, or changing filters/search returns that box (and the page) to top.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    rootRef.current?.closest('main')?.scrollTo({ top: 0 });
  }, [safePage, search, section, onlyCustomized, pageSize]);

  const handleDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
    setStatus(null);
  }, []);

  const handleSaveAll = async () => {
    if (saving) return;
    setStatus(null);
    // Diff against the effective value at load: only changed keys are written.
    // A key edited back to its bundled wording sends '' (reset to bundled).
    const diff: OverrideMap = {};
    for (const [k, v] of Object.entries(drafts)) {
      const wasCustom = k in loaded && loaded[k].trim().length > 0;
      const bundled = bundledByKey[k] ?? '';
      const baseEff = wasCustom ? loaded[k] : bundled;
      if (v === baseEff) continue; // untouched in this session
      diff[k] = v === bundled ? '' : v; // edited back to bundled = reset
    }
    if (Object.keys(diff).length === 0) {
      setDrafts({});
      setStatus({ kind: 'success', text: tRef.current('languageSettings.savedDb') });
      return;
    }
    setSaving(true);
    try {
      const result = await saveGuOverrideDiff(diff, loaded);
      if (result.ok) {
        const next = await loadGuOverrides();
        setLoaded(next);
        setDrafts({});
        await refreshGuOverrides();
        setStatus({
          kind: 'success',
          text: result.localOnly
            ? tRef.current('languageSettings.savedLocal')
            : tRef.current('languageSettings.savedDb'),
        });
      } else {
        setStatus({ kind: 'error', text: result.error ?? tRef.current('languageSettings.saveError') });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetRow = useCallback(
    async (key: string) => {
      setStatus(null);
      const result = await resetGuOverrides(key);
      if (result.ok) {
        const next = await loadGuOverrides();
        setLoaded(next);
        setDrafts((prev) => {
          if (!(key in prev)) return prev;
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        await refreshGuOverrides();
      } else {
        setStatus({ kind: 'error', text: result.error ?? tRef.current('languageSettings.resetError') });
      }
    },
    [refreshGuOverrides]
  );

  const handleResetAll = async () => {
    if (resettingAll) return;
    setStatus(null);
    setResettingAll(true);
    try {
      const result = await resetGuOverrides({ all: true });
      if (result.ok) {
        const next = await loadGuOverrides();
        setLoaded(next);
        setDrafts({});
        await refreshGuOverrides();
        setStatus({ kind: 'success', text: tRef.current('languageSettings.resetDone') });
      } else {
        setStatus({ kind: 'error', text: result.error ?? tRef.current('languageSettings.resetError') });
      }
    } finally {
      setResettingAll(false);
    }
  };

  // Labels hoisted so memoized rows only re-render when the locale changes.
  const customLabel = t('languageSettings.thCustom');
  const bundledLabel = t('languageSettings.thBundled');
  const customPh = t('languageSettings.customPh');
  const customizedBadge = t('languageSettings.customized');
  const bundledBadge = t('languageSettings.bundled');
  const resetLabel = t('languageSettings.resetRow');
  const resetTitle = t('languageSettings.resetRowTitle');

  return (
    <div ref={rootRef} className="lang-fit-root gap-4 min-w-0 overflow-x-clip">
      <Card className="p-5 space-y-3 shadow-2xs shrink-0">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Languages className="w-4 h-4 text-muted-foreground shrink-0" />
            <CardTitle className="break-words">{t('languageSettings.title')}</CardTitle>
          </div>
          <ShellBadge />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed break-words">{t('languageSettings.subtitle')}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed break-words">{t('languageSettings.note')}</p>

        {status && (
          <Alert tone={status.kind === 'success' ? 'success' : 'destructive'}>
            <div className="flex items-center gap-2 min-w-0">
              {status.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span className="break-words">{status.text}</span>
            </div>
          </Alert>
        )}
      </Card>

      {/* Fixed chrome: with the page filling the shell exactly, the controls
          never scroll away and need no sticky positioning. */}
      <div className="shrink-0">
        <Card className="p-4 space-y-3 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Label className="mb-1 sr-only">{t('languageSettings.searchPh')}</Label>
              <SearchInput
                placeholder={t('languageSettings.searchPh')}
                aria-label={t('languageSettings.searchPh')}
                icon={<Search className="w-3.5 h-3.5" />}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1 sr-only">{t('languageSettings.sectionAll', { count: sections.length })}</Label>
              <Select
                aria-label={t('languageSettings.sectionAll', { count: sections.length })}
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setPage(1);
                }}
                className="w-52 max-w-full"
              >
                <option value={ALL_SECTIONS}>
                  {t('languageSettings.sectionAll', { count: sections.length })}
                </option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer whitespace-nowrap pb-2 shrink-0">
              <input
                type="checkbox"
                checked={onlyCustomized}
                onChange={(e) => {
                  setOnlyCustomized(e.target.checked);
                  setPage(1);
                }}
                className="accent-primary"
              />
              <span>{t('languageSettings.onlyCustomized')}</span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11px] font-mono text-muted-foreground break-words">
              {t('languageSettings.customizedCount', { customized: customizedCount, total: rows.length })}
              {' • '}
              {t('languageSettings.showing', { shown: filtered.length, total: rows.length })}
              {dirtyCount > 0 ? ` • ${t('languageSettings.unsaved', { count: dirtyCount })}` : ''}
            </p>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div
                className="flex items-center gap-1 mr-1"
                role="navigation"
                aria-label={t('languageSettings.pageOf', { page: safePage, pages: pageCount })}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  title={t('languageSettings.prevPage')}
                >
                  <span>{t('languageSettings.prevPage')}</span>
                </Button>
                <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap px-1">
                  {t('languageSettings.pageOf', { page: safePage, pages: pageCount })}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= pageCount}
                  title={t('languageSettings.nextPage')}
                >
                  <span>{t('languageSettings.nextPage')}</span>
                </Button>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleResetAll()}
                disabled={resettingAll || customizedCount === 0}
                title={t('languageSettings.resetAll')}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('languageSettings.resetAll')}</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleSaveAll()}
                disabled={saving || loading || dirtyCount === 0}
              >
                <span>{saving ? t('languageSettings.saving') : t('languageSettings.saveAll')}</span>
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">
          {t('languageSettings.saving')}
        </Card>
      ) : loadError ? (
        <Alert tone="destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="break-words">{loadError}</span>
          </div>
        </Alert>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">
          {t('languageSettings.noResults')}
        </Card>
      ) : (
        <>
        <div ref={listRef} className="lang-list-scroll space-y-2 min-w-0">
          {paged.map((r) => {
            const isCustom = r.key in loaded && loaded[r.key].trim().length > 0;
            const value = effectiveOf(r.key, drafts, loaded);
            const isDirty =
              r.key in drafts && drafts[r.key] !== (isCustom ? loaded[r.key] : r.bundled);
            return (
              <LanguageRow
                key={r.key}
                rowKey={r.key}
                english={r.english}
                bundled={r.bundled}
                value={value}
                isCustom={isCustom}
                isDirty={isDirty}
                customLabel={customLabel}
                bundledLabel={bundledLabel}
                customPh={customPh}
                statusLabel={isCustom ? customizedBadge : bundledBadge}
                resetLabel={resetLabel}
                resetTitle={resetTitle}
                onDraft={handleDraft}
                onReset={handleResetRow}
              />
            );
          })}
        </div>
        <Card className="p-4 shadow-2xs shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            className="flex items-center gap-1.5 flex-wrap"
            role="navigation"
            aria-label={t('languageSettings.pageOf', { page: safePage, pages: pageCount })}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
              title={t('languageSettings.firstPage')}
            >
              <span>{t('languageSettings.firstPage')}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              title={t('languageSettings.prevPage')}
            >
              <span>{t('languageSettings.prevPage')}</span>
            </Button>
            <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap px-1">
              {t('languageSettings.pageOf', { page: safePage, pages: pageCount })}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount}
              title={t('languageSettings.nextPage')}
            >
              <span>{t('languageSettings.nextPage')}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(pageCount)}
              disabled={safePage >= pageCount}
              title={t('languageSettings.lastPage')}
            >
              <span>{t('languageSettings.lastPage')}</span>
            </Button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select
              aria-label={t('languageSettings.perPage')}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-24"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {t('languageSettings.perPage')}
            </span>
          </div>
        </Card>
        </>
      )}
    </div>
  );
};
