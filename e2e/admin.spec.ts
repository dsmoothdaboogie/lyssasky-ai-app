import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN_EMAIL = 'admin@lyssasky.test';
const ADMIN_PASSWORD = 'password';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PHOTO = path.join(__dirname, 'fixtures', 'room.jpg');

/**
 * Shared sign-in flow for every admin spec: signs in as the seeded admin
 * user (functions/src/seed/seedAdmin.ts grants the `admin: true` custom
 * claim) and waits for the redirect into the leads list, which is the
 * shell's default landing route.
 */
async function signInAsAdmin(page: Page) {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin\/leads$/, { timeout: 15_000 });
}

/**
 * Admin console smoke test against the Firebase Emulator Suite. Signs in as
 * the seeded admin user, confirms the leads list renders, and — if a lead
 * already exists (e.g. from funnel.spec.ts, though these specs don't rely on
 * run order) — opens its briefing card and checks it renders.
 */
test('admin can sign in and view the leads list and a lead briefing', async ({ page }) => {
  await signInAsAdmin(page);

  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();

  const viewLinks = page.getByRole('link', { name: 'View' });
  const leadCount = await viewLinks.count();

  if (leadCount === 0) {
    // No leads yet in this run — the list rendering itself (empty-state
    // message included) is still a valid assertion of admin access.
    await expect(page.getByText('No leads match this filter.')).toBeVisible();
    return;
  }

  // On the mobile viewport the wide table scrolls horizontally and the sticky
  // admin header can cover the link's click point, so click it via the DOM instead.
  const href = await viewLinks.first().getAttribute('href');
  expect(href).toMatch(/^\/admin\/leads\/.+/);
  await viewLinks.first().evaluate((el) => (el as HTMLElement).click());
  await expect(page).toHaveURL(/\/admin\/leads\/.+/);

  await expect(page.getByRole('heading', { name: 'Questionnaire answers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rating & feedback' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Booking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
});

/**
 * Styles CRUD: create a brand-new style via the `/admin/styles/new` form
 * (all required fields, including the five recipe fields) and confirm it
 * shows up back in the `/admin/styles` table after saving.
 */
test('admin can create a new style and see it in the styles list', async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByRole('link', { name: 'Styles' }).click();
  await expect(page).toHaveURL(/\/admin\/styles$/);
  await expect(page.getByRole('heading', { name: 'Styles' })).toBeVisible();

  await page.getByRole('link', { name: 'New style' }).click();
  await expect(page).toHaveURL(/\/admin\/styles\/new$/);
  await expect(page.getByRole('heading', { name: 'New style' })).toBeVisible();

  const unique = Date.now();
  const slug = `e2e_style_${unique}`;
  const name = `E2E Style ${unique}`;

  await page.getByLabel('Slug').fill(slug);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Description', { exact: true }).fill('An E2E test style, created by admin-tools.spec.');
  await page.getByLabel('Recipe description').fill('Warm, layered, and eclectic with a modern twist.');
  await page.getByLabel('Materials').fill('reclaimed wood, brushed brass, woven jute');
  await page.getByLabel('Palette').fill('terracotta, cream, and deep forest green');
  await page.getByLabel('Furniture').fill('rounded silhouettes, mixed vintage and new pieces');
  await page.getByLabel('Avoid').fill('no stark minimalism, no cold metals');

  await page.getByRole('button', { name: 'Save style' }).click();

  await expect(page).toHaveURL(/\/admin\/styles$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Styles' })).toBeVisible();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: slug, exact: true })).toBeVisible();
});

/**
 * Test bench: upload the fixture photo, pick a seeded style ("Scandinavian",
 * from functions/src/seed/styles.data.ts), generate, and confirm a result
 * image renders. Generation runs through the real `adminTestBenchGenerate`
 * callable using the mock provider (config/app.generationMode === 'mock',
 * the seeded default), so it completes offline in well under the timeout.
 */
test('admin can run a test bench generation and see a result image', async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByRole('link', { name: 'Test bench' }).click();
  await expect(page).toHaveURL(/\/admin\/testbench$/);
  await expect(page.getByRole('heading', { name: 'Test bench' })).toBeVisible();

  await page.getByLabel('Upload a test photo').setInputFiles(FIXTURE_PHOTO);

  const styleSelect = page.getByLabel('Style', { exact: true });
  await expect(styleSelect).toBeEnabled({ timeout: 15_000 });
  await styleSelect.selectOption({ label: 'Scandinavian' });

  const generateButton = page.getByRole('button', { name: 'Generate' });
  // Enabled only once the upload has finished and a style is selected —
  // waiting here for "enabled" also waits out the upload.
  await expect(generateButton).toBeEnabled({ timeout: 20_000 });
  await generateButton.click();

  await expect(page.locator('.testbench-result-image').first()).toBeVisible({ timeout: 30_000 });
});

/**
 * Config: change the price, save, then hard-reload the page and confirm the
 * new value was actually persisted to Firestore (not just held in local
 * component state).
 */
test('admin can update the price in config and it persists after reload', async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByRole('link', { name: 'Config' }).click();
  await expect(page).toHaveURL(/\/admin\/config$/);
  await expect(page.getByRole('heading', { name: 'Config' })).toBeVisible();

  const priceInput = page.getByLabel('Price (dollars)');
  await expect(priceInput).toBeVisible({ timeout: 15_000 });

  const newPrice = String(10 + (Date.now() % 90)); // a whole-dollar value, e.g. "47"
  await priceInput.fill(newPrice);
  await page.getByRole('button', { name: 'Save config' }).click();

  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 15_000 });

  await page.reload();

  await expect(page.getByLabel('Price (dollars)')).toHaveValue(newPrice, { timeout: 15_000 });
});

/**
 * Analytics: confirm the funnel and revenue sections render with actual
 * numbers/labels. Since admin.spec.ts runs before funnel.spec.ts (Playwright
 * sorts spec files alphabetically and this suite is single-worker/serial),
 * there may be zero leads yet — the funnel section legitimately shows an
 * empty state in that case, but the revenue stat tiles (a formatted dollar
 * amount, a lead count) render unconditionally, so those are asserted on
 * directly rather than assuming non-zero funnel counts.
 */
test('admin can view the analytics funnel and revenue sections', async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 15_000 });

  const funnelSection = page.locator('section[aria-label="Funnel"]');
  await expect(funnelSection).toBeVisible();
  await expect(funnelSection.getByRole('heading', { name: 'Funnel' })).toBeVisible();

  const revenueSection = page.locator('section[aria-label="Revenue"]');
  await expect(revenueSection).toBeVisible();
  await expect(revenueSection.getByRole('heading', { name: 'Revenue' })).toBeVisible();
  await expect(revenueSection.getByText(/^\$\d+\.\d{2}$/)).toBeVisible();
  await expect(revenueSection.getByText('Total leads')).toBeVisible();
});
