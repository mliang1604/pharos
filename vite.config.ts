import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/pharos/' : '/',
  // Mirror of the tsconfig `paths` alias. tsconfig only teaches the
  // type-checker how to resolve `@/…`; this teaches Vite/Vitest how to resolve
  // it at dev/build/test time. Both must agree or imports break at runtime.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Two lanes, separated by directory so a file's path declares its kind.
    // `extends: true` inherits the root Vite config above (notably the `@/`
    // alias). Unit tests run in Node with a mocked GPU; integration tests get
    // their own lane so `npm test` stays fast and CI-safe — switch the
    // integration environment to a real GPU (browser/dawn) when the first one
    // lands.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
    ],
  },
}));
