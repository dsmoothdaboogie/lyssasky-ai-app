import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Never run the compiled tsc output in lib/ (it duplicates the src tests).
    exclude: ['**/node_modules/**', 'lib/**'],
    // Integration tests share one Firestore emulator instance and some (e.g.
    // admin config, analytics) read/write shared documents/collections
    // (config/app, leads, generations) across the whole DB. Running test
    // files in parallel workers races on that shared state, so force
    // sequential file execution for determinism.
    fileParallelism: false,
  },
});
