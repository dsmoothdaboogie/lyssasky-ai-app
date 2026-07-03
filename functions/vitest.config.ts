import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Never run the compiled tsc output in lib/ (it duplicates the src tests).
    exclude: ['**/node_modules/**', 'lib/**'],
  },
});
