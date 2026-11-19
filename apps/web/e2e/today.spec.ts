import { expect, type Page, test } from '@playwright/test';
import { registerViaApi } from './support/users';

async function api(page: Page, path: string, data: unknown) {
  const { cookies } = await page.context().storageState();
  const token = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await page.request.post(`/api/v1${path}`, {
    headers: { 'X-XSRF-TOKEN': token },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test('log every type, keep a running timer across a reload, and backfill yesterday', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await registerViaApi(page.request);
  const { date: today } = await (await page.request.get('/api/v1/today')).json();
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const core = await api(page, '/cores', { name: 'Health', color: 'emerald', icon: 'heart-pulse' });
  const habit = (fields: object) =>
    api(page, '/habits', {
      coreId: core.id,
      scheduleType: 'DAILY',
      startDate: yesterday,
      ...fields,
    });
  await habit({ name: 'Vitamins', type: 'TOGGLE' });
  await habit({ name: 'Water', type: 'COUNT', targetValue: 8, unit: 'glasses' });
  const meditate = await habit({ name: 'Meditate', type: 'DURATION', targetValue: 600 });

  await page.goto('/today');
  const vitamins = page.getByRole('article', { name: 'Vitamins' });
  const water = page.getByRole('article', { name: 'Water' });
  await vitamins.getByRole('button', { name: 'Vitamins done' }).click();
  for (let i = 0; i < 3; i += 1) {
    await water.getByRole('button', { name: 'One more Water' }).click();
  }
  await expect(water.getByText('3', { exact: true })).toBeVisible();

  // The timer keeps running through a reload.
  await page.getByRole('button', { name: 'Start timer for Meditate' }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  const stop = page.getByRole('button', { name: 'Stop timer for Meditate' });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(1000);
  await stop.click();
  await expect(page.getByRole('button', { name: 'Start timer for Meditate' })).toBeVisible();

  // Everything was saved.
  await page.reload();
  await expect(vitamins.getByRole('button', { name: 'Vitamins done' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(water.getByText('3', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const logs = await (await page.request.get(`/api/v1/habits/${meditate.id}/logs`)).json();
      return logs.find((log: { date: string }) => log.date === today)?.value ?? 0;
    })
    .toBeGreaterThanOrEqual(2);

  // Backfill yesterday: the streak becomes two days.
  await expect(vitamins.getByLabel('1-day streak')).toBeVisible();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByText('Backfilling')).toBeVisible();
  await vitamins.getByRole('button', { name: 'Vitamins done' }).click();
  await expect(vitamins.getByRole('button', { name: 'Vitamins done' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(vitamins.getByLabel('2-day streak')).toBeVisible();

  expect(errors).toEqual([]);
});
