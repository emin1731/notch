import { expect, test } from '@playwright/test';
import { logInViaApi, seedPendingReview } from './support/seed';

test('a pending review: banner, review page, undo, and the badge is gone', async ({ page }) => {
  await logInViaApi(page.request, seedPendingReview());

  await page.goto('/today');
  const banner = page.getByRole('link', { name: /See review/ });
  await expect(banner).toContainText('Your week is in. 1 eased off.');
  const deepWork = page.getByRole('article', { name: 'Deep work' });
  await expect(deepWork.getByRole('button', { name: 'Eased off: 60 → 55 min' })).toBeVisible();

  await banner.click();
  await expect(page.getByRole('heading', { level: 1, name: /Week of/ })).toBeVisible();
  const card = page
    .getByRole('region', { name: 'Eased off' })
    .getByRole('article', { name: 'Deep work' });
  await expect(card).toContainText('60 → 55 min');
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText("Back to 60 min. We'll check again next week.")).toBeVisible();
  await expect(card.getByText('Undone')).toBeVisible();

  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(deepWork).toBeVisible();
  await expect(page.getByRole('link', { name: /See review/ })).toHaveCount(0);
  await expect(deepWork.getByRole('button', { name: /Eased off/ })).toHaveCount(0);
});

test('logging at the new level locks the undo', async ({ page }) => {
  await logInViaApi(page.request, seedPendingReview());

  await page.goto('/today');
  const deepWork = page.getByRole('article', { name: 'Deep work' });
  await deepWork.getByRole('button', { name: 'Add time' }).click();
  await page.getByLabel('Minutes to add to Deep work').fill('25');
  await page.getByLabel('Minutes to add to Deep work').press('Enter');
  await expect(deepWork.getByText('25', { exact: true })).toBeVisible();

  // The lock comes from the server, once the log is saved and the day refreshed.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await deepWork.getByRole('button', { name: /Eased off/ }).click();
    await expect(page.getByRole('dialog')).toContainText(
      "You've already logged at the new target, so this one's locked in.",
    );
  }).toPass({ timeout: 10_000 });
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Undo' })).toHaveCount(0);
});
