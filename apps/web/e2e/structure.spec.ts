import { expect, test } from '@playwright/test';
import { registerViaApi } from './support/users';

test('build cores, give one a habit, archive it and bring it back', async ({ page }) => {
  // Every console error fails the spec, CSP violations included.
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await registerViaApi(page.request);

  await page.goto('/cores');
  await page.getByRole('button', { name: 'Health' }).click();
  const health = page.getByRole('article', { name: 'Health' });
  await expect(health).toBeVisible();

  await page.getByRole('button', { name: 'Add core' }).click();
  const coreDialog = page.getByRole('dialog', { name: 'New core' });
  await coreDialog.getByLabel('Name').fill('Reading');
  await coreDialog.getByRole('radio', { name: 'Violet' }).click();
  await coreDialog.getByLabel('Search icons').fill('book');
  await coreDialog.getByRole('radio', { name: 'Book' }).click();
  await coreDialog.getByRole('button', { name: 'Create core' }).click();
  await expect(page.getByRole('article', { name: 'Reading' })).toBeVisible();

  await health.getByRole('button', { name: 'Add habit' }).click();
  const dialog = page.getByRole('dialog', { name: 'New habit' });
  await expect(dialog.getByLabel('Core').locator('option:checked')).toHaveText('Health');
  await dialog.getByLabel('Name', { exact: true }).fill('Stretch');
  await dialog.getByRole('button', { name: 'Add habit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL('/cores');
  await expect(health.getByRole('link', { name: /^Stretch/ })).toBeVisible();

  // Archiving the core takes its habit with it.
  await health.getByRole('button', { name: 'Health actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await page
    .getByRole('alertdialog', { name: 'Archive Health?' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await expect(health).toBeHidden();

  // The core comes back first, then its habit.
  await page.getByRole('switch', { name: 'Show archived' }).click();
  await health.getByRole('button', { name: 'Health actions' }).click();
  await page.getByRole('menuitem', { name: 'Unarchive' }).click();
  await expect(page.getByText('Health is back. Unarchive its habits one by one.')).toBeVisible();
  await health.getByRole('button', { name: 'Stretch actions' }).click();
  await page.getByRole('menuitem', { name: 'Unarchive' }).click();
  await expect(page.getByText('Stretch is back.')).toBeVisible();
  await expect(health.getByText('Archived', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
