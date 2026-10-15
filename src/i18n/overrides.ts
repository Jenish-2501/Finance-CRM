// Helpers for admin-customized Gujarati wording.
//
// The bundled dictionaries (en.ts / gu.ts) are the source of truth for keys.
// Overrides are a flat map { "nav.dashboard": "…" } stored in SQLite
// (language_overrides table, via window.electronAPI.language) with a
// localStorage mirror so the browser preview works without the desktop shell.
export const GU_OVERRIDES_STORAGE_KEY = 'acculedger-gu-overrides';

export type OverrideMap = Record<string, string>;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Flatten a nested dictionary to [{ key: "nav.dashboard", value }] rows. */
export function flattenDictionary(
  dict: Record<string, unknown>,
  prefix = ''
): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push({ key: path, value: v });
    else if (isPlainObject(v)) out.push(...flattenDictionary(v, path));
  }
  return out;
}

export function getByPath(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (isPlainObject(acc) && part in acc) return (acc as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

/** Immutable deep-merge of flat overrides over a base dictionary. */
export function applyOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: OverrideMap
): T {
  // Structured clone of plain JSON dictionaries (values are strings only).
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const parts = key.split('.');
    let node: Record<string, unknown> = out;
    let valid = true;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const next = node[parts[i]];
      if (!isPlainObject(next)) {
        valid = false;
        break;
      }
      node = next as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    if (valid && typeof node[leaf] === 'string') node[leaf] = value;
  }
  return out as T;
}

function readLocalMirror(): OverrideMap {
  try {
    const raw = localStorage.getItem(GU_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return {};
    const out: OverrideMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalMirror(map: OverrideMap): void {
  try {
    localStorage.setItem(GU_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage failure must not block the UI */
  }
}

/** Load stored customizations: desktop DB first, localStorage fallback. */
export async function loadGuOverrides(): Promise<OverrideMap> {
  const bridge = window.electronAPI?.language;
  if (bridge?.list) {
    try {
      const rows = await bridge.list();
      const out: OverrideMap = {};
      if (rows && typeof rows === 'object') {
        for (const [k, v] of Object.entries(rows)) {
          if (typeof v === 'string' && v.trim().length > 0) out[k] = v;
        }
      }
      writeLocalMirror(out);
      return out;
    } catch {
      // Stale shell (no language:list handler yet) — fall through to mirror.
    }
  }
  return readLocalMirror();
}

/**
 * Persist customizations: desktop DB first (authoritative), always mirror to
 * localStorage so the browser preview and a stale shell still render them.
 * Returns { ok, localOnly } — localOnly is true outside the desktop app.
 */
export async function persistGuOverrides(
  map: OverrideMap
): Promise<{ ok: boolean; localOnly?: boolean; error?: string }> {
  return saveGuOverrideDiff(map, await loadGuOverrides());
}

/**
 * Merge a diff over a base map and persist it. Empty values in the diff reset
 * that key to the bundled wording (the row is kept as '' per the table
 * contract, never deleted). Used by the Language settings route for Save All.
 */
export async function saveGuOverrideDiff(
  diff: OverrideMap,
  base: OverrideMap
): Promise<{ ok: boolean; localOnly?: boolean; error?: string }> {
  const merged: OverrideMap = { ...base };
  for (const [k, v] of Object.entries(diff)) {
    if (typeof v !== 'string' || v.trim().length === 0) delete merged[k];
    else merged[k] = v;
  }
  writeLocalMirror(merged);
  const bridge = window.electronAPI?.language;
  if (!bridge?.save) return { ok: true, localOnly: true };
  try {
    const result = await bridge.save(diff);
    if (result?.ok) return { ok: true };
    return { ok: false, error: result?.message ?? 'Gujarati wording could not be saved.' };
  } catch {
    return {
      ok: false,
      error: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.',
    };
  }
}

/** Reset one key (or everything) to the bundled wording. */
export async function resetGuOverrides(
  keyOrAll: string | { all: true }
): Promise<{ ok: boolean; localOnly?: boolean; error?: string }> {
  if (keyOrAll === 'all' || (typeof keyOrAll === 'object' && 'all' in keyOrAll)) {
    writeLocalMirror({});
    const bridge = window.electronAPI?.language;
    if (!bridge?.reset) return { ok: true, localOnly: true };
    try {
      const result = await bridge.reset({ all: true });
      if (result?.ok) return { ok: true };
      return { ok: false, error: result?.message ?? 'Gujarati wording could not be reset.' };
    } catch {
      return {
        ok: false,
        error: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.',
      };
    }
  }
  const key = keyOrAll as string;
  const current = readLocalMirror();
  delete current[key];
  writeLocalMirror(current);
  const bridge = window.electronAPI?.language;
  if (!bridge?.reset) return { ok: true, localOnly: true };
  try {
    const result = await bridge.reset(key);
    if (result?.ok) return { ok: true };
    return { ok: false, error: result?.message ?? 'Gujarati wording could not be reset.' };
  } catch {
    return {
      ok: false,
      error: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.',
    };
  }
}
