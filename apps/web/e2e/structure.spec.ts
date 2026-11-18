import { expect, test } from '@playwright/test';
import { registerViaApi } from './support/users';

test('build cores and a goal, tick every milestone, and celebrate', async ({ page }) => {
  // Every console error fails the spec: that includes CSP violations (the confetti canvas).
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

  await health.getByRole('button', { name: 'Add goal' }).click();
  const goalDialog = page.getByRole('dialog', { name: 'New goal' });
  await goalDialog.getByLabel('Title').fill('Run a half marathon');
  const milestones = ['Run 5 km', 'Run 10 km', 'Run 21 km'];
  for (const milestone of milestones) {
    await goalDialog.getByLabel('Milestones (optional)').fill(milestone);
    await goalDialog.getByLabel('Milestones (optional)').press('Enter');
  }
  await goalDialog.getByRole('button', { name: 'Create goal' }).click();
  await expect(goalDialog).toBeHidden();

  await health.getByRole('link', { name: /Run a half marathon/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Run a half marathon' })).toBeVisible();
  for (const milestone of milestones.slice(0, -1)) {
    const box = page.getByRole('checkbox', { name: milestone });
    await box.click();
    await expect(box).toBeChecked();
  }
  // The last tick opens the celebration, which hides the page behind it (no checkbox to assert).
  await page.getByRole('checkbox', { name: milestones.at(-1) }).click();

  const celebration = page.getByRole('dialog', { name: 'Goal done: Run a half marathon' });
  await expect(celebration).toBeVisible();
  await celebration.getByRole('button', { name: 'Close' }).click();
  await expect(celebration).toBeHidden();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();

  await page.goto('/cores');
  await expect(health.getByText('Completed (1)')).toBeVisible();
  expect(errors).toEqual([]);
});
