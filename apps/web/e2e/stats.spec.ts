import type { HabitDto, HabitStatsDto, StatsOverviewDto } from '@notch/shared';
import { expect, type Page, test } from '@playwright/test';
import { logInViaApi, seedPendingReview } from './support/seed';

const percent = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

function failOnConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401/.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

test('the stats page shows the API’s numbers at every range', async ({ page }) => {
  const errors = failOnConsoleErrors(page);
  await logInViaApi(page.request, seedPendingReview());
  await page.goto('/stats');

  for (const [label, range] of [
    ['7 days', '7d'],
    ['30 days', '30d'],
    ['90 days', '90d'],
    ['1 year', '365d'],
  ] as const) {
    await page.getByRole('radio', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`range=${range}`));
    const data = await get<StatsOverviewDto>(page, `/stats/overview?range=${range}`);
    const numbers = page.getByLabel('Key numbers');
    await expect(page.getByRole('region', { name: 'Completion over time' })).toContainText(
      `${percent(data.overallRate)}of what you planned`,
    );
    await expect(numbers).toContainText(`Best streak${data.topStreaks[0]?.currentStreak ?? '—'}`);
    await expect(numbers).toContainText(`Goals completed${data.goals.completedInRange}`);
    await expect(
      numbers.getByLabel(`${data.changes.levelUps} up, ${data.changes.deloads} eased off`),
    ).toBeVisible();
    for (const core of data.cores) {
      await expect(page.getByRole('region', { name: 'By core' })).toContainText(
        `${core.name}${percent(core.rate)}`,
      );
    }
  }
  expect(errors).toEqual([]);
});

test('a habit’s detail matches the API, and editing yesterday updates it', async ({ page }) => {
  const errors = failOnConsoleErrors(page);
  await logInViaApi(page.request, seedPendingReview());
  const habits = await get<HabitDto[]>(page, '/habits');
  const read = habits.find((habit) => habit.name === 'Read')!;

  await page.goto(`/habits/${read.id}?range=90d`);
  const totals = page.getByLabel('Totals');
  const before = await get<HabitStatsDto>(page, `/stats/habits/${read.id}?range=90d`);
  await expect(totals).toContainText(
    `Completion${percent(before.rate)}${before.hits} of ${before.occurrences} days`,
  );
  await expect(totals).toContainText(`Total logged${before.totalValue} pages`);

  const calendar = page.getByRole('region', { name: 'Calendar' });
  await expect(calendar.getByRole('img')).toHaveCount(before.heatmap.length);
  await calendar.getByRole('radio', { name: 'Table' }).click();
  await expect(calendar.getByRole('row')).toHaveCount(before.heatmap.length + 1);

  // A value that can't already be there: the stats have to move.
  const yesterday = before.heatmap[before.heatmap.length - 2]!;
  const value = yesterday.value + 7;
  const field = page.getByRole('spinbutton', { name: 'Pages: Read, Yesterday' });
  await field.fill(String(value));
  await field.press('Enter');

  await expect(async () => {
    const after = await get<HabitStatsDto>(page, `/stats/habits/${read.id}?range=90d`);
    expect(after.totalValue).toBe(before.totalValue - yesterday.value + value);
    await expect(totals).toContainText(`Total logged${after.totalValue} pages`, { timeout: 1000 });
    await expect(totals).toContainText(
      `Completion${percent(after.rate)}${after.hits} of ${after.occurrences} days`,
      { timeout: 1000 },
    );
  }).toPass();
  await expect(field).toHaveValue(String(value));
  expect(errors).toEqual([]);
});
