import { expect, test } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

async function advanceOnboarding(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)

    const start = page.getByRole('button', { name: /Get started/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(1500)
      continue
    }

    const createPage = page.getByRole('button', { name: /create your first page/i })
    if ((await createPage.count()) > 0 && (await createPage.first().isVisible())) {
      await createPage.first().click()
      await page.waitForTimeout(1500)
      break
    }

    const homeHeading = page.getByRole('heading', { name: /all documents/i })
    const pagesText = page.getByText('Pages', { exact: true })
    if (
      ((await homeHeading.count()) > 0 && (await homeHeading.first().isVisible())) ||
      ((await pagesText.count()) > 0 && (await pagesText.first().isVisible()))
    ) {
      break
    }

    break
  }
}

test.describe('Editor UX mobile', () => {
  test.skip(({ isMobile }) => !isMobile)

  test('toolbar stays available during keyboard transitions', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await expect(
      page
        .getByRole('heading', { name: /all documents/i })
        .or(page.getByText('Pages', { exact: true }))
    ).toBeVisible({ timeout: 30_000 })

    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /^Page$/ }).click()
    await page.waitForURL(/\/doc\//, { timeout: 30_000 })

    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await page.keyboard.type('mobile toolbar slash test')
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.up('Shift')

    const toolbar = page.locator(
      '[data-testid="editor-mobile-toolbar"], [data-testid="editor-desktop-toolbar"]'
    )
    await expect(toolbar.first()).toBeVisible()
    await page.screenshot({
      path: 'tmp/playwright/editor-mobile-toolbar-anchored.png',
      fullPage: true
    })

    await page.keyboard.type('/code')
    await page.keyboard.press('Enter')
    await page.screenshot({
      path: 'tmp/playwright/editor-mobile-codeblock-focus.png',
      fullPage: true
    })
  })
})
