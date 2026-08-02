import { defineConfig } from '@playwright/test';

/**
 * Accessibility gate. Tests run against the production build served by
 * `vite preview`, so what passes here is what actually ships to Pages.
 * Run `npm run build` first.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  webServer: {
    // Build before serving. Playwright serves dist/, so without this a run can
    // test a stale bundle — and a build that FAILS leaves the previous good
    // bundle in place, so the suite passes green against code that no longer
    // compiles. That silently invalidates any mutation check.
    command: 'npm run build && npm run preview -- --port 4320 --strictPort',
    url: 'http://localhost:4320/crypto-lab-time-lock-puzzle/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        baseURL: 'http://localhost:4320/crypto-lab-time-lock-puzzle/',
        colorScheme: 'dark',
      },
    },
  ],
});
