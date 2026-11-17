import { setupServer } from 'msw/node';

/** The API, mocked. Tests add handlers with `server.use(...)`. Unmocked requests fail the test. */
export const server = setupServer();
