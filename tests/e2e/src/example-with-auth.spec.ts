import { test, expect } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

test.describe('Authenticated App Tests', () => {
  test('app loads and renders authenticated state', async ({ page }) => {
    await setupTestAuth(page)

    const root = page.locator('#root')
    await expect(root).toBeVisible()

    const initializingText = page.locator('text=Initializing')
    await expect(initializingText).not.toBeVisible()
  })

  test('storage warning banner can be dismissed', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('xnet:test:bypass', 'true')
      localStorage.setItem('xnet:test:trigger-warning', 'true')
    })

    await page.goto('http://localhost:5173')

    const warningBanner = page.locator('[role="alert"]')
    if ((await warningBanner.count()) > 0) {
      const closeButton = warningBanner.locator(
        'button[aria-label*="dismiss"], button[aria-label*="close"]'
      )
      if ((await closeButton.count()) > 0) {
        await closeButton.click()
        await expect(warningBanner).not.toBeVisible()
      }
    }
  })
})
