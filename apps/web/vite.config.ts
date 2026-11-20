import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same origin as in production: the API's cookies and CSRF check work unchanged.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    // Playwright's specs live in e2e/ and run against the real API.
    include: ['src/**/*.test.{ts,tsx}'],
    // Form tests type key by key; under turbo's parallel load (lint, build, the API's database
    // tests) they can pass the 5 s default. Each `findBy` still gives up after 5 s.
    testTimeout: 15_000,
    css: false,
    // The device's timezone matches the test user's (src/test/auth.ts), wherever the tests run:
    // otherwise Today offers to switch timezones in every test.
    env: { TZ: 'Asia/Baku' },
  },
});
