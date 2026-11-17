import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  // One file per module, so the web bundle only includes what it imports.
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
});
