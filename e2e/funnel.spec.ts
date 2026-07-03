import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PHOTO = path.join(__dirname, 'fixtures', 'room.jpg');

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
  // --- Landing ---
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'See your room, restyled' })).toBeVisible();
  await page.getByRole('button', { name: 'See your room, restyled — $5' }).click();

  // --- Upload ---
  await expect(page).toHaveURL(/\/upload$/);
  await page.locator('#photo-upload').setInputFiles(FIXTURE_PHOTO);

  // --- Questionnaire ---
  await expect(page).toHaveURL(/\/questionnaire$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Tell us about your space' })).toBeVisible();

  await page
    .getByRole('group', { name: 'Which room are we restyling?' })
    .getByRole('button', { name: 'Living room' })
    .click();

  const styleGroup = page.getByRole('group', { name: 'Pick a style that speaks to you' });
  await expect(styleGroup.getByRole('button').first()).toBeVisible();
  await styleGroup.getByRole('button').first().click();

  await page
    .getByRole('group', { name: "What's the mood?" })
    .getByRole('button', { name: 'Warm & cozy' })
    .click();

  await page
    .getByRole('group', { name: "What's your rough budget for this room?" })
    .getByRole('button', { name: 'Under $1,000' })
    .click();

  await page
    .getByRole('group', { name: 'When are you hoping to start?' })
    .getByRole('button', { name: 'Just dreaming' })
    .click();

  const continueButton = page.getByRole('button', { name: 'Continue' });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  // --- Email ---
  await expect(page).toHaveURL(/\/email$/);
  const testEmail = `e2e-${Date.now()}@example.com`;
  await page.getByLabel('Email address').fill(testEmail);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Email submission triggers a full-page redirect (window.location.assign)
  // to the mock checkout page.
  await expect(page).toHaveURL(/\/mock-checkout\?lead=.*session=/, { timeout: 15_000 });

  // --- Mock checkout ---
  await expect(page.getByRole('heading', { name: 'Almost there' })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate success' }).click();

  // --- Wait screen -> result ---
  // Navigates to /wait?lead=... then, once the onLeadPaid trigger finishes
  // mock generation, the realtime subscription pushes us to /result. With
  // the mock provider this can happen in well under a polling interval, so
  // the /wait URL itself isn't asserted on (it can flash by unobserved) —
  // only the eventual, generously-timed landing on /result matters.
  await expect(page).toHaveURL(/\/result\?lead=/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Your new room, reimagined' })).toBeVisible({
    timeout: 30_000,
  });

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
