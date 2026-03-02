import { expect, test } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

async function advanceOnboarding(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const start = page.getByRole('button', { name: /Get started with Touch ID/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(500)
      continue
    }

    const createPage = page.getByRole('button', { name: /create your first page/i })
    if ((await createPage.count()) > 0 && (await createPage.first().isVisible())) {
      await createPage.first().click()
      await page.waitForTimeout(500)
      continue
    }

    break
  }
}

test.describe('Editor UX desktop', () => {
  test.skip(({ browserName, isMobile }) => browserName === 'webkit' || isMobile)

  test('selection toolbar and slash behavior stay stable', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await setupTestAuth(page)
    await advanceOnboarding(page)
    await page.getByRole('heading', { name: /all documents/i }).waitFor({ timeout: 30_000 })

    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /^Page$/ }).click()
    await page.waitForURL(/\/doc\//, { timeout: 30_000 })

    const editor = page.locator('[contenteditable="true"]').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('desktop toolbar slash test')

    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.up('Shift')

    await expect(page.getByTestId('editor-desktop-toolbar')).toBeVisible()
    await page.screenshot({
      path: 'tmp/playwright/editor-desktop-selection-toolbar.png',
      fullPage: true
    })
    await expect(page).toHaveScreenshot('editor-desktop-selection-toolbar.png', { fullPage: true })

    await editor.click()
    await page.keyboard.type('\n/')
    await expect(page.getByTestId('slash-menu')).toBeVisible()
    await page.screenshot({ path: 'tmp/playwright/editor-slash-menu-open.png', fullPage: true })
    await expect(page).toHaveScreenshot('editor-slash-menu-open.png', { fullPage: true })

    await expect(consoleErrors).toEqual([])
  })
})
