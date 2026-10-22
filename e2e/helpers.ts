import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PHOTO = path.join(__dirname, 'fixtures', 'room.jpg');

/**
 * Drives the funnel from landing all the way through mock checkout to a
 * completed (mock) generation, landing on `/result?lead={leadId}`. Shared by
 * funnel.spec.ts (which continues on from here to rate + book) and
 * result-token.spec.ts (which uses the resulting leadId to exercise the
 * cross-device emailed-link path) so the funnel-walkthrough steps only live
 * in one place.
 */
export async function runFunnelToResult(page: Page): Promise<{ leadId: string; email: string }> {
  // --- Landing ---
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'See your room, restyled' })).toBeVisible();
  await page.getByRole('button', { name: 'Get your Room Pass — $5' }).click();

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
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.getByLabel('Email address').fill(email);
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

  const url = new URL(page.url());
  const leadId = url.searchParams.get('lead');
  if (!leadId) throw new Error('Expected a leadId in the /result URL');
  return { leadId, email };
}

/**
 * Reads a lead's opaque `leadToken` straight from the Firestore emulator's
 * REST API, bypassing firestore.rules with the emulator's documented
 * `Authorization: Bearer owner` admin-bypass credential — the same mechanism
 * `@firebase/rules-unit-testing`'s admin app relies on. A plain
 * unauthenticated request would be denied here: firestore.rules only lets
 * the lead's own `ownerUid` or an admin read a `leads/{id}` doc, and this
 * script running outside the browser is neither.
 *
 * Simulates how the real emailed link comes to exist without needing to
 * stand up an actual mail sink: `runGeneration.ts` mails this same
 * `leadToken` to the customer once generation finishes, so reading it here
 * is equivalent to "the customer opens their result-ready email".
 */
export async function fetchLeadToken(request: APIRequestContext, leadId: string): Promise<string> {
  const res = await request.get(
    `http://127.0.0.1:8080/v1/projects/demo-lyssasky/databases/(default)/documents/leads/${leadId}`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  if (!res.ok()) {
    throw new Error(`Failed to read lead ${leadId} from the Firestore emulator (${res.status()})`);
  }
  const body = (await res.json()) as { fields?: { leadToken?: { stringValue?: string } } };
  const token = body.fields?.leadToken?.stringValue;
  if (!token) throw new Error(`Lead ${leadId} has no leadToken field`);
  return token;
}
