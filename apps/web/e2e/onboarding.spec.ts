import { expect, test } from '@playwright/test';
import { E2E_INVITE_CODE, E2E_PASSWORD, uniqueUsername } from './support/users';

test('register → onboarding (2 cores, a goal with 3 milestones, 3 habits) → Today', async ({
  page,
}) => {
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

  // A goal with three milestones.
  await page.getByLabel('Goal', { exact: true }).fill('Run a half marathon');
  const milestone = page.getByLabel('Milestones (optional)');
  for (const title of ['Run 5 km', 'Run 10 km', 'Race day']) {
    await milestone.fill(title);
    await milestone.press('Enter');
  }
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

  // Onboarding is done for good; the goal and its milestones are there.
  await page.goto('/onboarding');
  await expect(page).toHaveURL('/today');
  await page.goto('/cores');
  await page.getByRole('link', { name: 'Run a half marathon' }).click();
  await expect(page.getByText('0 / 3 milestones')).toBeVisible();
  expect(errors).toEqual([]);
});
