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
    css: false,
  },
});
