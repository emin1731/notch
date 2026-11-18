import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { clearCookies } from './auth';
import { server } from './server';

// Pages are lazy chunks: the first import can take over a second when the whole suite runs.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia; tests can override it per case.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
  clearCookies();
  document.documentElement.className = '';
});
afterAll(() => server.close());
