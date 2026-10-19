/**
 * Playwright test authentication helpers
 *
 * Provides utilities for bypassing WebAuthn/passkey authentication in tests.
 */
import type { Page } from '@playwright/test'

function isNavigationAbortError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('ERR_ABORTED')
}

/**
 * Enable test bypass mode for a Playwright page.
 * Must be called before navigating to the app.
 *
 * @example
 * await enableTestBypass(page)
 * await page.goto('http://localhost:5173')
 * // App will skip WebAuthn and create a test identity
 */
async function enableTestBypass(page: Page): Promise<void> {
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
async function waitForAuthenticated(page: Page, timeout = 15000): Promise<void> {
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
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    if (!isNavigationAbortError(error)) {
      throw error
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
  }
  await waitForAuthenticated(page)
}

/** Existing workspace gates enter through the chat shell's public navigation. */
export async function openWorkspaceToolsIfVisible(page: Page): Promise<void> {
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true })
  if (!(await navigation.isVisible())) return
  await navigation.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
}
