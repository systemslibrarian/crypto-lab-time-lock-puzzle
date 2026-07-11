import { defineConfig } from 'vitest/config';

// Unit tests only. The Playwright accessibility spec under e2e/ is a *.spec.ts
// that Vitest's default glob would otherwise try to collect (and fail on,
// since it imports @playwright/test); keep e2e/ out of the Vitest run.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
