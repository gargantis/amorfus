import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vendor/hermet's tests too: the shared tooling must pass under
    // amorfus's own versions of ESLint, ws and vitest.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'e2e/lib/**/*.test.mjs', 'vendor/hermet/**/*.test.mjs'],
    environment: 'node',
  },
});
