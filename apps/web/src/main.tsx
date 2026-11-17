import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Providers } from './app/Providers';
import { createQueryClient } from './app/query-client';
import { routes } from './app/routes';

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers client={createQueryClient()}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
