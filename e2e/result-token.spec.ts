import { test, expect } from '@playwright/test';
import { fetchLeadToken, runFunnelToResult } from './helpers';

/**
 * Regression test for the Phase 2 final-review finding: the emailed
 * cross-device result link (`/result?lead=...&token=...`) was broken for a
 * genuinely new device. The client used to resolve the generated image's
 * Storage path itself (`getImageUrl`, i.e. the client SDK's
 * `getDownloadURL`), and storage.rules only allows reading
 * `leads/{ownerUid}/generated/*` for the lead's owning uid or an admin —
 * never a fresh anonymous uid from a different browser. `getResultByToken`
 * (functions/src/result.ts) now resolves the download URL server-side
 * instead, bypassing that Storage rule entirely, so this asserts the image
 * actually renders when the link is opened from a browser context that does
 * NOT own the lead — a fresh `browser.newContext()`, simulating a different
 * device from the one that ran the funnel and got a fresh anonymous auth uid
 * of its own.
 */
test('the emailed result link renders the image from a different browser context (cross-device)', async ({
  page,
  request,
  browser,
}) => {
  const { leadId } = await runFunnelToResult(page);
  const leadToken = await fetchLeadToken(request, leadId);

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`/result?lead=${leadId}&token=${leadToken}`);

    await expect(
      otherPage.getByRole('heading', { name: 'Your new room, reimagined' })
    ).toBeVisible({ timeout: 15_000 });

    const img = otherPage.getByAltText(/your new room|generated|after/i);
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toMatch(/^https?:\/\//);

    // Token mode is read-only: rating/regenerate are owner-guarded
    // server-side, so a device that can't prove ownership never sees them.
    await expect(
      otherPage.getByRole('group', { name: 'How close is this to your vision?' })
    ).not.toBeVisible();
  } finally {
    await otherContext.close();
  }
});
