import { test, expect } from '@playwright/test';
import { runFunnelToResult } from './helpers';

/**
 * End-to-end funnel walkthrough against the Firebase Emulator Suite
 * (auth, firestore, storage, functions). Generation runs through the real
 * `onLeadPaid` trigger using the mock provider (config/app.generationMode
 * === 'mock', the seeded default), so the whole flow completes offline in a
 * few seconds without ever touching Gemini or Stripe.
 *
 * Landing -> upload -> questionnaire -> email -> mock checkout (simulate
 * success) -> wait -> result (rate) -> booking.
 */
test('completes the full customer funnel end to end', async ({ page }) => {
  await runFunnelToResult(page);

  // --- Result: rate + continue ---
  await page
    .getByRole('group', { name: 'How close is this to your vision?' })
    .getByRole('button', { name: '5', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // --- Booking ---
  await expect(page).toHaveURL(/\/book\?lead=/, { timeout: 15_000 });
  await expect(
    page.getByRole('heading', { name: "Let's take this from preview to real life" })
  ).toBeVisible();
  await page.getByLabel('Name').fill('E2E Test Customer');
  await page.getByRole('button', { name: 'Book my consultation' }).click();

  await expect(
    page.getByText("You're all set — Marjorie will be in touch. Pick a time below whenever you're ready.")
  ).toBeVisible({ timeout: 10_000 });
});
