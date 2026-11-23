import { defineConfig } from 'tsdown';

export default defineConfig(({ watch }) => ({
  entry: ['src/index.ts'],
  format: 'esm',
  // One file per module, so the web bundle only includes what it imports.
  unbundle: true,
  dts: true,
  sourcemap: true,
  // Not in watch mode: `dev` starts after `^build`, and wiping dist/ then makes Vite, starting
  // at the same moment, fail to resolve @notch/shared and keep failing until it restarts.
  clean: !watch,
}));
