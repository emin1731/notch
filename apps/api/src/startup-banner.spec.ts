import { describe, expect, it } from 'vitest';
import { startupBanner } from './startup-banner.js';

const base = { nodeEnv: 'development', port: 3000, docs: true, startedInSeconds: 2.04 } as const;

describe('startupBanner', () => {
  it('shows where the app, the API and its docs run, in a box', () => {
    expect(startupBanner({ ...base, servesWeb: false, webDevUrl: 'http://localhost:5173' })).toBe(
      [
        '┌─────────────────────────────────────────────────────┐',
        '│  notch is running · development · started in 2.0 s  │',
        '│                                                     │',
        '│  App      http://localhost:5173                     │',
        '│  API      http://localhost:3000/api/v1              │',
        '│  Docs     http://localhost:3000/docs                │',
        '│  Health   http://localhost:3000/api/v1/health       │',
        '└─────────────────────────────────────────────────────┘',
      ].join('\n'),
    );
  });

  it('says when the web dev server is not up, and uses its own origin when it serves the app', () => {
    expect(startupBanner({ ...base, servesWeb: false, webDevUrl: null })).toContain(
      'App      not running (pnpm dev starts it)',
    );
    expect(startupBanner({ ...base, servesWeb: true, webDevUrl: null })).toContain(
      'App      http://localhost:3000 ',
    );
  });

  it('keeps every row the same width when coloured', () => {
    const coloured = startupBanner(
      { ...base, servesWeb: false, webDevUrl: 'http://localhost:5173' },
      (_format, text) => `\u001b[36m${text}\u001b[39m`,
    );
    // eslint-disable-next-line no-control-regex
    const widths = coloured.split('\n').map((line) => line.replace(/\u001b\[\d+m/g, '').length);
    expect(new Set(widths).size).toBe(1);
  });
});
