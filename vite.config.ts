import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

// The browser loads Pyodide from the CDN at exactly the version pinned in
// package.json, so tests (which use the npm package) and production agree.
const { version: pyodideVersion } = createRequire(import.meta.url)('pyodide/package.json') as {
  version: string;
};

export default defineConfig({
  // Relative asset URLs let the same build run from any GitHub Pages subpath.
  base: './',
  define: {
    __PYODIDE_VERSION__: JSON.stringify(pyodideVersion),
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
