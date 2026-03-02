/**
 * Playwright test authentication helpers
 *
 * Provides utilities for bypassing WebAuthn/passkey authentication in tests.
 */
import type { Page } from '@playwright/test'

/**
 * Enable test bypass mode for a Playwright page.
 * Must be called before navigating to the app.
 *
 * @example
 * await enableTestBypass(page)
 * await page.goto('http://localhost:5173')
 * // App will skip WebAuthn and create a test identity
 */
export async function enableTestBypass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('xnet:test:bypass', 'true')
  })
}

/**
 * Wait for the app to complete initialization and authentication.
 * Returns when the authenticated state is reached.
 *
 * @param page - Playwright page instance
 * @param timeout - Maximum wait time in milliseconds (default: 15000)
 */
export async function waitForAuthenticated(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = document.querySelector('#root')
      return app && !app.textContent?.includes('Initializing')
    },
    { timeout }
  )
}

/**
 * Complete setup: enable bypass and wait for authentication.
 * One-liner for most test scenarios.
 *
 * @example
 * test('devtools SQLite panel', async ({ page }) => {
 *   await setupTestAuth(page)
 *   // Now you can interact with authenticated app
 * })
 */
export async function setupTestAuth(
  page: Page,
  url = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'
): Promise<void> {
  await enableTestBypass(page)
  await page.goto(url)
  await waitForAuthenticated(page)
}
