import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError } from '@/lib/chunk-error';
import { RouteError } from './RouteError';

function renderFailing(error: Error) {
  // React logs the caught error; it's expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const router = createMemoryRouter([
    {
      errorElement: <RouteError />,
      children: [
        {
          path: '/',
          Component: () => {
            throw error;
          },
        },
      ],
    },
  ]);
  render(<RouterProvider router={router} />);
}

describe('route error', () => {
  it('asks a stale tab to reload when a page’s code is gone', async () => {
    renderFailing(new TypeError('Failed to fetch dynamically imported module: /assets/Stats.js'));
    expect(await screen.findByRole('heading', { name: 'notch was updated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('offers a way back for anything else', async () => {
    renderFailing(new Error('boom'));
    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute('href', '/today');
  });

  it('knows each browser’s words for a missing chunk', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(
      true,
    );
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: x'))).toBe(
      true,
    );
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
