import { test, expect } from '@playwright/test';
import { runFunnelToResult } from './helpers';

async function restyle(page: import('@playwright/test').Page, styleIndex: number, mood: string) {
  await page.getByRole('button', { name: 'Try another look' }).click();
  const styles = page.getByRole('group', { name: 'Pick a style' }).getByRole('button');
  await styles.nth(styleIndex).click();
  await page.getByRole('group', { name: 'Pick a mood' }).getByRole('button', { name: mood }).click();
  await page.getByRole('button', { name: 'Restyle' }).click();
  await expect(page.getByRole('button', { name: 'Try another look' })).toBeVisible({ timeout: 30_000 });
}

test('Room Pass: restyle twice, see the looks strip, book with the perk code', async ({ page }) => {
  await runFunnelToResult(page);

  await expect(page.getByText(/5 restyles left · ends/)).toBeVisible();
  await expect(page.getByText(/ROOM-[A-Z2-9]{4}/)).toBeVisible();

  await restyle(page, 1, 'Light & airy');
  await expect(page.getByText(/4 restyles left/)).toBeVisible();
  await restyle(page, 2, 'Bold & dramatic');
  await expect(page.getByText(/3 restyles left/)).toBeVisible();

  await expect(page.getByRole('group', { name: 'Your looks' }).getByRole('button')).toHaveCount(3);

  await page.getByRole('link', { name: /Book your free 15-min chat/ }).click();
  await expect(page).toHaveURL(/\/book\?lead=/);
  await expect(page.getByText(/ROOM-[A-Z2-9]{4}/)).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("I'm interested in").selectOption('room_refresh');
  await page.getByLabel('Name').fill('E2E Room Pass');
  await page.getByRole('button', { name: 'Book my consultation' }).click();
  await expect(page.getByText(/You're all set/)).toBeVisible({ timeout: 10_000 });
});

test('Room Pass: an exhausted pass routes to Marjorie', async ({ page }) => {
  await runFunnelToResult(page);
  const moods = ['Light & airy', 'Bold & dramatic', 'Neutral & calm', 'Warm & cozy', 'Light & airy'];
  for (const [i, mood] of moods.entries()) {
    await page.getByRole('button', { name: 'Try another look' }).click();
    await page.getByRole('group', { name: 'Pick a style' }).getByRole('button').nth(i % 3).click();
    await page.getByRole('group', { name: 'Pick a mood' }).getByRole('button', { name: mood }).click();
    await page.getByRole('button', { name: 'Restyle' }).click();
    // The last restyle leaves "No restyles left", so it surfaces via the "You've explored" copy.
    await expect(page.getByText(new RegExp(`${4 - i} restyles? left|You've explored`))).toBeVisible({ timeout: 30_000 });
  }
  await expect(page.getByText("You've explored 6 looks — next step: talk them through with Marjorie.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try another look' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start a new Room Pass' })).toBeVisible();
});
