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
  const addHabit = async (name: string) => {
    await page.goto('/cores');
    await health.getByRole('link', { name: 'Add habit' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New habit' })).toBeVisible();
    await page.getByLabel('Name').fill(name);
  };
  const save = async (label = 'Add habit') => {
    await page.getByRole('button', { name: label }).click();
    await expect(page).toHaveURL('/cores');
  };

  // Yes/no, three times a week, with its levels preview.
  await addHabit('Vitamins');
  await page.getByRole('radio', { name: 'Times a week' }).click();
  await expect(
    page.getByText("If you're consistent: 3× → 4× → 5× → 6× a week over the next 6 weeks."),
  ).toBeVisible();
  await save();

  // Count, on some days, with a unit.
  await addHabit('Read');
  await page.getByRole('radio', { name: 'Count' }).click();
  await page.getByLabel('Target', { exact: true }).fill('20');
  await page.getByLabel('Unit (optional)').fill('pages');
  await page.getByRole('radio', { name: 'Weekly' }).click();
  for (const day of ['Monday', 'Wednesday', 'Friday']) {
    await page.getByRole('button', { name: day }).click();
  }
  await save();

  // Duration, every day.
  await addHabit('Meditate');
  await page.getByRole('radio', { name: 'Duration' }).click();
  await page.getByLabel('Target (minutes)').fill('30');
  await save();

  await expect(health.getByRole('link', { name: /Vitamins\s*3× a week/ })).toBeVisible();
  await expect(health.getByRole('link', { name: /Read\s*Mon, Wed, Fri · 20 pages/ })).toBeVisible();
  await expect(health.getByRole('link', { name: /Meditate\s*Every day · 30 min/ })).toBeVisible();

  // A new target counts as a manual change.
  await health.getByRole('button', { name: 'Meditate actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('radio', { name: 'Count' })).toBeDisabled();
  await page.getByLabel('Target (minutes)').fill('45');
  await expect(page.getByText(/This counts as a manual change/)).toBeVisible();
  await save('Save changes');
  await expect(health.getByRole('link', { name: /Meditate\s*Every day · 45 min/ })).toBeVisible();

  expect(errors).toEqual([]);
});
