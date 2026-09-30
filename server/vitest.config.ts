import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 60000, // starting an in-memory Postgres (WASM) can take several seconds on a cold run
  },
});
