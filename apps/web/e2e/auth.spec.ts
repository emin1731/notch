import { expect, test } from '@playwright/test';
import { E2E_INVITE_CODE, E2E_PASSWORD, registerViaApi, uniqueUsername } from './support/users';

const pageHeading = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('heading', { level: 1, name });

test('register, stay logged in across a reload, log out, and log back in', async ({ page }) => {
  const username = uniqueUsername();

  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Name (optional)').fill('Playwright');
  await page.getByLabel('Invite code').fill(E2E_INVITE_CODE);
  await page.getByRole('button', { name: 'Create account' }).click();

  // A new account sets up first: the shortest way through onboarding.
  await expect(page).toHaveURL('/onboarding');
  await page.getByRole('button', { name: 'Mind' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page).toHaveURL('/today');
  await expect(pageHeading(page, 'Today')).toBeVisible();
  const account = page.getByRole('complementary').getByRole('button', { name: 'Playwright' });
  await expect(account).toBeVisible();

  // The session lives in an HttpOnly cookie, so it survives a reload.
  await page.reload();
  await expect(pageHeading(page, 'Today')).toBeVisible();

  await account.click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
  await expect(pageHeading(page, 'Log in')).toBeVisible();

  // Logged out, a protected page goes to login, and login comes back to it.
  await page.goto('/stats');
  await expect(page).toHaveURL('/login');
  await expect(pageHeading(page, 'Log in')).toBeVisible();
  await page.getByLabel('Username').fill(username.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL('/stats');
  await expect(pageHeading(page, 'Stats')).toBeVisible();
});

test('shows a wrong invite code and a wrong password on the form', async ({ page }) => {
  const { username } = await registerViaApi(page.context().request);
  await page.context().clearCookies();

  await page.goto('/register');
  await page.getByLabel('Username').fill(uniqueUsername());
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Invite code').fill('not-the-code');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Invite code')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText("That invite code doesn't work.")).toBeVisible();

  await page.getByRole('link', { name: 'Log in' }).click();
  // The register page has a Username field too: wait for the login page to replace it.
  await expect(pageHeading(page, 'Log in')).toBeVisible();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText("That username and password don't match.");
});
