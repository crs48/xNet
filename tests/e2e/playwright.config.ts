import { defineConfig } from '@playwright/test'

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
  }
})
