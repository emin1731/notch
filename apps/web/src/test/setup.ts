import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
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

// jsdom has no layout APIs; Radix (switch, checkbox, dialogs) and dnd-kit expect them.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  cleanup();
  localStorage.clear();
  clearCookies();
  document.documentElement.className = '';
});
afterAll(() => server.close());
