import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/i18n/en.js';

function flat(o: Record<string, unknown>, p: string, out: string[]): string[] {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (typeof v === 'string') out.push(key);
    else if (v && typeof v === 'object') flat(v as Record<string, unknown>, key, out);
  }
  return out;
}
const keys = flat(en as unknown as Record<string, unknown>, '', []);
function walk(d: string, acc: string[]): void {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (!p.includes('src/i18n')) walk(p, acc); continue; }
    if (/\.(tsx|ts)$/.test(f)) acc.push(fs.readFileSync(p, 'utf8'));
  }
}
const acc: string[] = [];
walk('src', acc);
const all = acc.join('\n');
const dead = keys.filter((k) => !all.includes(`t('${k}'`) && !all.includes(`t("${k}"`) && !all.includes(`translate('${k}'`));
console.log('total keys: ' + keys.length);
console.log('dead keys (' + dead.length + '):');
for (const k of dead) console.log('  ' + k);
