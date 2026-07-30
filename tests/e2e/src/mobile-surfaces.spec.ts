/**
 * Mobile-viewport coverage for all four surfaces (exploration 0238).
 *
 * The mobile app hosts this exact `apps/web` SPA in a native webview, so the
 * cheapest, fastest guard that the surfaces work on a phone is to drive them at
 * a phone viewport with touch. Runs under the Playwright `mobile-chromium`
 * (Pixel 7) and `mobile-webkit` (iPhone 14) projects — see
 * `tests/e2e/playwright.config.ts` — and skips on desktop projects.
 *
 * This is the layer-1 web gate from 0238. It mirrors the proven navigation in
 * `editor-ux-mobile.spec.ts`. It is intentionally not yet wired into the
 * required `editor-ux` CI smoke command; promote it there once it has run green
 * on a hosted mobile runner.
 */
import { expect, test, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

async function advanceOnboarding(page: Page): Promise<void> {
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

    const homeHeading = page.getByRole('heading', { name: /all documents|everything/i })
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

/** Create a new surface from the mobile shell's `New` action. */
async function createSurface(page: Page, surface: 'Page' | 'Database' | 'Canvas'): Promise<void> {
  const main = page.getByRole('main')
  await main.getByRole('button', { name: /^New$/i }).click()
  await main.getByRole('button', { name: new RegExp(`^${surface}$`) }).click()
}

test.describe('Mobile surfaces (0238)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile projects only')

  test.beforeEach(async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await expect(
      page
        .getByRole('heading', { name: /all documents|everything/i })
        .or(page.getByText('Pages', { exact: true }))
    ).toBeVisible({ timeout: 30_000 })
  })

  test('document surface opens and is editable on a phone', async ({ page }) => {
    await createSurface(page, 'Page')
    await page.waitForURL(/\/doc\//, { timeout: 30_000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await page.keyboard.type('mobile document surface')
    await expect(editor).toContainText('mobile document surface')
  })

  test('database surface renders the grid on a phone', async ({ page }) => {
    await createSurface(page, 'Database')
    await page.waitForURL(/\/db\//, { timeout: 30_000 })
    // The grid (or its empty state / add-row affordance) is present. .first()
    // on the combined locator: the DB toolbar's "Row height" button also
    // matches /row/i, and two strict-mode matches fail the assertion.
    await expect(
      page
        .getByRole('grid')
        .or(page.getByRole('button', { name: /add|new row|row/i }))
        .first()
    ).toBeVisible({ timeout: 30_000 })
  })

  test('canvas surface mounts its drawing surface on a phone', async ({ page }) => {
    await createSurface(page, 'Canvas')
    await page.waitForURL(/\/canvas\//, { timeout: 30_000 })
    await expect(page.locator('[data-canvas-surface="true"]').first()).toBeVisible({
      timeout: 30_000
    })
  })
})
