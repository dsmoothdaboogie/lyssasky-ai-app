import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@lyssasky.test';
const ADMIN_PASSWORD = 'password';

/**
 * Admin console smoke test against the Firebase Emulator Suite. Signs in as
 * the seeded admin user (functions/src/seed/seedAdmin.ts grants the
 * `admin: true` custom claim), confirms the leads list renders, and — if a
 * lead already exists (e.g. from funnel.spec.ts, though these specs don't
 * rely on run order) — opens its briefing card and checks it renders.
 */
test('admin can sign in and view the leads list and a lead briefing', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin\/leads$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();

  const viewLinks = page.getByRole('link', { name: 'View' });
  const leadCount = await viewLinks.count();

  if (leadCount === 0) {
    // No leads yet in this run — the list rendering itself (empty-state
    // message included) is still a valid assertion of admin access.
    await expect(page.getByText('No leads match this filter.')).toBeVisible();
    return;
  }

  await viewLinks.first().click();
  await expect(page).toHaveURL(/\/admin\/leads\/.+/);

  await expect(page.getByRole('heading', { name: 'Questionnaire answers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rating & feedback' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Booking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
});
