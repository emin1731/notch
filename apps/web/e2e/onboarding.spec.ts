import { expect, test } from '@playwright/test';
import { E2E_INVITE_CODE, E2E_PASSWORD, uniqueUsername } from './support/users';

test('register → onboarding (2 cores, 3 habits) → Today', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401/.test(message.text())) {
      errors.push(message.text());
    }
  });
  const started = Date.now();

  await page.goto('/register');
  await page.getByLabel('Username').fill(uniqueUsername('onboard'));
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Invite code').fill(E2E_INVITE_CODE);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Cores: a preset and one of your own.
  await expect(page).toHaveURL('/onboarding');
  await page.getByRole('button', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add your own' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Music');
  await page.getByRole('button', { name: 'Add core' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Two suggestions and one habit of your own.
  const health = page.getByRole('region', { name: 'Health' });
  await health.getByRole('button', { name: /^Walk/ }).click();
  await health.getByRole('button', { name: /^Drink water/ }).click();
  await page
    .getByRole('region', { name: 'Music' })
    .getByRole('button', { name: 'Create your own' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Practice guitar');
  await dialog.getByRole('radio', { name: 'Duration' }).click();
  await dialog.getByLabel('Target (minutes)').fill('15');
  await dialog.getByRole('button', { name: 'Add habit' }).click();
  await expect(page.getByText('3 habits picked.')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page).toHaveURL('/today');
  for (const name of ['Walk', 'Drink water', 'Practice guitar']) {
    await expect(page.getByRole('article', { name })).toBeVisible();
  }
  // Plan: sign-up to a populated Today in under two minutes (here, without a human's pauses).
  expect(Date.now() - started).toBeLessThan(120_000);

  // Onboarding is done for good; each habit is in its core.
  await page.goto('/onboarding');
  await expect(page).toHaveURL('/today');
  await page.goto('/cores');
  const healthCore = page.getByRole('article', { name: 'Health' });
  await expect(healthCore.getByRole('link', { name: /^Walk/ })).toBeVisible();
  await expect(healthCore.getByRole('link', { name: /^Drink water/ })).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Music' }).getByRole('link', { name: /^Practice guitar/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
