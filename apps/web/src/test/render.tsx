import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Providers } from '@/app/Providers';
import { createQueryClient } from '@/app/query-client';
import { routes } from '@/app/routes';

/** The whole app (real routes and providers) at `path`, with a fresh query cache. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = createQueryClient();
  return {
    router,
    client,
    ...render(
      <Providers client={client}>
        <RouterProvider router={router} />
      </Providers>,
    ),
  };
}
