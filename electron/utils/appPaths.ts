import { createRequire } from 'node:module';

// Resolves Electron's userData dir without a top-level `import { app }`.
// A static ESM named import breaks plain-Node tooling (tsx self-tests)
// because the electron package exports a binary path string outside Electron.
// require() interop returns `any`, letting us probe safely at call time.
export function getUserDataDir(): string {
  const req = createRequire(import.meta.url);
  const mod = req('electron') as unknown;
  if (mod && typeof mod === 'object' && 'app' in mod) {
    const app = (mod as { app: { getPath: (name: string) => string } }).app;
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  }
  throw new Error('Electron runtime is required to resolve the user data directory.');
}
