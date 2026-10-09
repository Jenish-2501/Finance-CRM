import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import electron from 'vite-plugin-electron';

// Production-only Content Security Policy (no wildcards, no remote hosts).
// Dev is intentionally excluded: Vite HMR needs ws:/unsafe-eval.
function productionCsp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    'media-src \'none\'',
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'acculedger-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta name="viewport"',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="viewport"`
      );
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      productionCsp(),
      electron([
        {
          entry: 'electron/main.ts',
          // Dev: `npm run dev` builds main, then launches the desktop shell
          // with VITE_DEV_SERVER_URL set so main.ts loads the dev server
          // (and the preload bridge). Without this, `vite` alone only serves
          // a browser preview with no bridge.
          onstart(options) {
            options.startup();
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              rolldownOptions: {
                external: ['electron', 'better-sqlite3'],
              },
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload();
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              // Lib mode derives output.format from lib.formats (forced ESM by
              // package type), which the sandbox cannot parse. Disable lib
              // mode and emit CJS explicitly.
              lib: false,
              rolldownOptions: {
                input: 'electron/preload.ts',
                platform: 'node',
                external: ['electron'],
                output: {
                  format: 'cjs',
                  // package.json has "type": "module", so a `.js` preload is
                  // treated as ESM and `require('electron')` throws
                  // ("require is not defined in ES module scope") -> bridge
                  // never exposed -> "SHELL ERROR - BRIDGE MISSING". `.cjs`
                  // forces CommonJS regardless of package type.
                  entryFileNames: 'preload.cjs',
                },
              },
            },
          },
        },
      ]),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
