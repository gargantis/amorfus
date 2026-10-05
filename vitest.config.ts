import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'e2e/lib/**/*.test.mjs'],
    environment: 'node',
  },
});
