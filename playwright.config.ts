import { defineConfig, devices } from '@playwright/test';

/**
 * Full-funnel + admin E2E, run against the Firebase Emulator Suite
 * (auth, firestore, storage, functions) on a mobile viewport. See
 * scripts/e2e.sh for the one-command runner: it builds functions, boots
 * the emulators, seeds config/styles/admin, then runs this suite. Playwright
 * itself boots the Vite dev server (below), which reads `.env.local` ->
 * `VITE_USE_EMULATORS=true` to point the app at the emulators.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      // devices['iPhone 13'] defaults to webkit; only chromium is installed
      // (per the task setup), so pin the engine while keeping the device's
      // mobile viewport/UA/touch emulation.
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
