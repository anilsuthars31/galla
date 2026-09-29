/// <reference types="vitest/config" />
// Evaluation scripts (write reports to docs/). Not part of `npm test`. Run: npm run eval:forecast
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/eval/**/*.eval.ts'],
    environment: 'node',
  },
});
