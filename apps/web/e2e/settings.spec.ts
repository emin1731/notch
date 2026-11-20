import { expect, type Page, test } from '@playwright/test';
import { E2E_PASSWORD, registerViaApi } from './support/users';

async function logIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('change the timezone and the password, then delete the account', async ({ page }) => {
  const { username } = await registerViaApi(page.request);
  await page.goto('/settings');

  // Timezone: the account is on UTC.
  const timezone = page.getByRole('region', { name: 'Timezone' });
  await timezone.getByLabel('Timezone').selectOption('Asia/Tokyo');
  await timezone.getByRole('button', { name: 'Save timezone' }).click();
  await expect(page.getByText('Timezone updated. Today now follows Asia/Tokyo.')).toBeVisible();
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  expect(me.timezone).toBe('Asia/Tokyo');

  // Password: the new one works after logging out.
  const password = page.getByRole('region', { name: 'Password' });
  await password.getByLabel('Current password').fill(E2E_PASSWORD);
  await password.getByLabel('New password').fill('a brand new password');
  await password.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText('Password changed. Your other devices were logged out.'),
  ).toBeVisible();
  await page.context().clearCookies();
  await logIn(page, username, 'a brand new password');
  await expect(page).toHaveURL('/today');

  // Delete: afterwards the account can't log in.
  await page.goto('/settings');
  await page
    .getByRole('region', { name: 'Danger zone' })
    .getByRole('button', { name: 'Delete account' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await dialog.getByLabel('Password', { exact: true }).fill('a brand new password');
  await dialog.getByRole('button', { name: 'Delete account' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByText('Your account was deleted.')).toBeVisible();

  await logIn(page, username, 'a brand new password');
  await expect(page.getByText("That username and password don't match.")).toBeVisible();
});

test('Today offers the device’s timezone when the account differs', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Asia/Baku' });
  const page = await context.newPage();
  await registerViaApi(page.request, { timezone: 'UTC' });
  await page.goto('/today');

  const banner = page.getByRole('region', { name: 'Timezone' });
  await expect(banner).toContainText('Your device is on Asia/Baku but your account uses UTC.');
  await banner.getByRole('button', { name: 'Use Asia/Baku' }).click();
  await expect(page.getByText('Timezone updated. Today now follows Asia/Baku.')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await context.close();
});
