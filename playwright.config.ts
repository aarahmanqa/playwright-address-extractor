import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Google Maps Address Extractor tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120000, // Increased timeout for Google Maps
  expect: {
    timeout: 15000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined, // Allow command line override
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  use: {
    actionTimeout: 20000,
    navigationTimeout: 60000,
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    // Use incognito mode for fresh sessions
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
    // Add user agent to avoid bot detection
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },

  projects: [
    {
      name: 'chromium-incognito',
      use: {
        ...devices['Desktop Chrome'],
        // Force incognito mode
        launchOptions: {
          args: ['--incognito', '--no-sandbox', '--disable-dev-shm-usage']
        }
      },
    },
  ],
});
