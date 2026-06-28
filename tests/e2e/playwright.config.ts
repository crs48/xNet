import { defineConfig, devices } from '@playwright/test'

// Specs that drive a real Electron app via `_electron.launch()` (0238 L3/L4).
// They must NOT run under the browser projects — only the dedicated `electron`
// project (which has the native rebuild + headless GUI) launches Electron.
// `sync-matrix.spec.ts` is intentionally absent here: its web↔web cells run in
// the browser projects, its electron cells in the electron project (it gates
// itself on `testInfo.project.name`).
const ELECTRON_ONLY = /(electron-smoke|packaged-smoke)\.spec\.ts/

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
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ELECTRON_ONLY
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: ELECTRON_ONLY
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        isMobile: true,
        hasTouch: true
      },
      testIgnore: ELECTRON_ONLY
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 14'],
        isMobile: true,
        hasTouch: true
      },
      testIgnore: ELECTRON_ONLY
    },
    {
      // Electron e2e: the cross-client matrix's electron cells (0238 L2), the
      // `_electron.launch()` app smoke (L3), and the packaged-binary gate (L4).
      // Uses a Chromium browser for the web half of electron↔web cells.
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(sync-matrix|electron-smoke|packaged-smoke)\.spec\.ts/
    }
  ]
})
