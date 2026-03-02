import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './src',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    headless: true
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        isMobile: true,
        hasTouch: true
      }
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 14'],
        isMobile: true,
        hasTouch: true
      }
    }
  ]
})
