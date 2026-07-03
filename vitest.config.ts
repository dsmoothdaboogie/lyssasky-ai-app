import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: false,
    // The functions/ workspace has its own Vitest (node env + emulator).
    // Keep those out of the root (jsdom) run. e2e/ holds Playwright specs
    // (run via `npm run e2e`, not Vitest) — they use Playwright's own
    // `test`/`expect`, which conflicts with Vitest's globals if collected.
    exclude: ['**/node_modules/**', '**/dist/**', 'functions/**', 'e2e/**'],
  },
});
