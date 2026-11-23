import { expect, type Page, test } from '@playwright/test';
import { registerViaApi } from './support/users';

/** A core through the API, the way the app creates one (the CSRF header from the cookie). */
async function createCore(page: Page, name: string) {
  const { cookies } = await page.context().storageState();
  const token = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await page.request.post('/api/v1/cores', {
    headers: { 'X-XSRF-TOKEN': token },
    data: { name, color: 'emerald', icon: 'heart-pulse' },
  });
  expect(response.status()).toBe(201);
}

test('create one habit of each type, then edit a target', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await registerViaApi(page.request);
  await createCore(page, 'Health');

  const health = page.getByRole('article', { name: 'Health' });
  // "Add habit" opens the form in a dialog over the Cores page; saving closes it.
  const dialog = page.getByRole('dialog', { name: 'New habit' });
  await page.goto('/cores');
  const addHabit = async (name: string) => {
    await health.getByRole('button', { name: 'Add habit' }).click();
    await dialog.getByLabel('Name').fill(name);
  };
  const add = async () => {
    await dialog.getByRole('button', { name: 'Add habit' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL('/cores');
  };

  // Yes/no, three times a week, with Levels switched on and their preview.
  await addHabit('Vitamins');
  await dialog.getByRole('radio', { name: 'Times a week' }).click();
  await dialog.getByRole('switch', { name: 'Adjust the target as I go' }).click();
  await expect(
    dialog.getByText("If you're consistent: 3× → 4× → 5× → 6× a week over the next 6 weeks."),
  ).toBeVisible();
  await add();

  // Count, on some days, with a unit.
  await addHabit('Read');
  await dialog.getByRole('radio', { name: 'Count' }).click();
  await dialog.getByLabel('Target', { exact: true }).fill('20');
  await dialog.getByLabel('Unit (optional)').fill('pages');
  await dialog.getByRole('radio', { name: 'Weekly' }).click();
  for (const day of ['Monday', 'Wednesday', 'Friday']) {
    await dialog.getByRole('button', { name: day }).click();
  }
  await add();

  // Duration, every day.
  await addHabit('Meditate');
  await dialog.getByRole('radio', { name: 'Duration' }).click();
  await dialog.getByLabel('Target (minutes)').fill('30');
  await add();

  await expect(health.getByRole('link', { name: /Vitamins\s*3× a week/ })).toBeVisible();
  await expect(health.getByRole('link', { name: /Read\s*Mon, Wed, Fri · 20 pages/ })).toBeVisible();
  await expect(health.getByRole('link', { name: /Meditate\s*Every day · 30 min/ })).toBeVisible();

  // With Levels on, a new target counts as a manual change. Saving goes back to Cores.
  await health.getByRole('button', { name: 'Meditate actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('radio', { name: 'Count' })).toBeDisabled();
  await page.getByLabel('Target (minutes)').fill('45');
  await expect(page.getByText(/This counts as a manual change/)).toBeHidden();
  await page.getByRole('switch', { name: 'Adjust the target as I go' }).click();
  await expect(page.getByText(/This counts as a manual change/)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL('/cores');
  await expect(health.getByRole('link', { name: /Meditate\s*Every day · 45 min/ })).toBeVisible();

  expect(errors).toEqual([]);
});
