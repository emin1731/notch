import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render';
import { NAV_ITEMS } from './nav';

describe('app shell', () => {
  it('redirects / to Today', async () => {
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/today');
  });

  it('has a labelled sidebar and tab bar with every section', async () => {
    renderApp('/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    for (const name of ['Main', 'Tabs']) {
      const nav = screen.getByRole('navigation', { name });
      expect(within(nav).getAllByRole('link')).toHaveLength(NAV_ITEMS.length);
    }
  });

  it('navigates and marks the current section', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });

    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(sidebar).getByRole('link', { name: 'Stats' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Stats' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/stats');
    expect(within(sidebar).getByRole('link', { name: 'Stats' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar).getByRole('link', { name: 'Today' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows Today with the local date from the shared package', async () => {
    renderApp('/today');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(heading.parentElement).toHaveTextContent(/day, \w+ \d+/);
  });

  it('shows a not-found page for unknown paths', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute('href', '/today');
  });

  it('renders guest pages without the app navigation', async () => {
    renderApp('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});
