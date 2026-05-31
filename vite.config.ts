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
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
}));
