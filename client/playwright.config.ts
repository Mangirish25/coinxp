import { defineConfig, devices } from 'playwright/test';

/**
 * Browser smoke tests use deterministic API fixtures. They validate the browser
 * route/session journey without requiring a seeded personal finance database.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: process.env.CI
    ? [
        { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
        { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit-mobile', use: { ...devices['iPhone 13'] } },
      ]
    : [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 7'], channel: 'msedge' } },
      ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run storybook -- --host 127.0.0.1 --ci',
      url: 'http://127.0.0.1:6006/index.json',
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
