// Postinstall patch: make electron-builder's Electron dist staging rename
// resilient to Windows filter drivers (e.g. Defender real-time protection)
// holding freshly-extracted files open. Node's fs.rename uses
// MOVEFILE_WRITE_THROUGH and fails with EPERM; PowerShell Move-Item
// succeeds where fs.rename and cmd move do not, so we fall back to it.
// Without this, `electron-builder --win` fails with
// `EPERM: operation not permitted, rename '...win-unpacked.tmp'`.
// Idempotent — safe to run on every `npm install`.
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'util', 'electronGet.js');
const anchor = 'await fs.rm(dir, { recursive: true, force: true });\n        await fs.rename(tmpDir, dir);';
const replacement = `await fs.rm(dir, { recursive: true, force: true });
        // Staging rename with fallbacks (local build-env patch;
        // see scripts/patch-builder-rename.cjs). Node's fs.rename uses
        // MOVEFILE_WRITE_THROUGH, which fails with EPERM/EACCES while a
        // filter driver (e.g. Defender real-time protection) holds
        // freshly-extracted files open — PowerShell Move-Item succeeds
        // where fs.rename and cmd move do not.
        try {
            await fs.rename(tmpDir, dir);
        }
        catch (e) {
            if (e.code !== "EPERM" && e.code !== "EACCES") {
                throw e;
            }
            const psQuote = (p) => \`'\${p.replace(/'/g, "''")}'\`;
            await builder_util_1.exec("powershell.exe", [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                \`Move-Item -LiteralPath \${psQuote(tmpDir)} -Destination \${psQuote(dir)} -Force\`,
            ]);
        }`;

try {
  const src = fs.readFileSync(target, 'utf8');
  if (src.includes('MOVEFILE_WRITE_THROUGH')) {
    console.log('[patch-builder-rename] already applied, skipping.');
  } else if (!src.includes(anchor)) {
    console.warn('[patch-builder-rename] anchor not found — app-builder-lib may have updated; skipping.');
  } else {
    fs.writeFileSync(target, src.replace(anchor, replacement));
    console.log('[patch-builder-rename] applied rename-fallback patch.');
  }
} catch (err) {
  console.warn('[patch-builder-rename] skipped:', err.message);
}
