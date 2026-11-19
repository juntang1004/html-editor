import { defineConfig } from '@playwright/test';

// [animation-ai] STUDIO_TEST_PORT lets parallel worktrees run the suite without sharing 4417.
const port = Number(process.env.STUDIO_TEST_PORT || 4417);

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: `http://127.0.0.1:${port}/api/session`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
