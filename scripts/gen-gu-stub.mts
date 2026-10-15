// One-time generator: builds src/i18n/gu.ts (stub) + gu-handoff.csv from en.ts.
// Run: npx tsx scripts/gen-gu-stub.mts   (repo root)
// The reviewer fills the Gujarati column in the CSV (or edits gu.ts directly);
// tsc enforces that gu.ts keeps every key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from '../src/i18n/en.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const flat: Array<[string, string]> = [];
function walk(obj: Record<string, unknown>, prefix: string): void {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') flat.push([key, v]);
    else if (v && typeof v === 'object') walk(v as Record<string, unknown>, key);
  }
}
walk(en as unknown as Record<string, unknown>, '');

function nest(list: Array<[string, string]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of list) {
    const parts = key.split('.');
    let node: Record<string, unknown> = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) {
        node[parts[i]] = {};
      }
      node = node[parts[i]] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = val;
  }
  return out;
}

const stub = nest(flat);
const guTs =
  `// Gujarati dictionary — WIP. Every value below is still ENGLISH.\n` +
  `// The gu-reviewer replaces values only (keys must stay identical).\n` +
  `// Progress: 0/${flat.length} translated.\n` +
  `import type { EnDictionary } from './en';\n\n` +
  `export const gu: EnDictionary = ` +
  JSON.stringify(stub, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/\\u/g, '\\u') +
  `;\n`;

fs.writeFileSync(path.join(root, '..', 'src', 'i18n', 'gu.ts'), guTs);

const csv = ['key,english,gujarati', ...flat.map(([k, v]) => `${k},"${v.replace(/"/g, '""')}",`)].join('\n');
fs.writeFileSync(path.join(root, '..', 'src', 'i18n', 'gu-handoff.csv'), csv);
console.log(`gu.ts + gu-handoff.csv written (${flat.length} keys).`);
