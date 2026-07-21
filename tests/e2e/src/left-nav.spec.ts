/**
 * The left nav's one rule (exploration 0388): **every primary section changes
 * the main area.**
 *
 * Five of eleven sections used to be `kind: 'lens'` and only re-filtered the
 * sidebar. In a vertical list of otherwise-navigating rows that is
 * indistinguishable from a broken button, and it hid two real regressions —
 * People and Views had lost the `/crm` and `/data` destinations they had
 * before the 0353 nav rewrite.
 *
 * Unit tests (`apps/web/src/workbench/sidebar/sections.test.ts`) cover the
 * resolution logic. This spec covers what they cannot: that clicking the real
 * row in the real shell actually repaints the main region.
 */
import { expect, test, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'

/** Click through the passkey-bypass onboarding into the shell. */
async function advanceOnboarding(page: Page): Promise<void> {
  const ready = page.locator('[data-wb-region="sidebar"]')
  for (let i = 0; i < 10; i++) {
    if ((await ready.count()) > 0) return
    const start = page.getByRole('button', { name: /Get started|Create your first page/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(1500)
      // The sqlite worker often times out on first headless load; one reload
      // settles it into the authenticated shell (worktree render recipe).
      await page.reload({ waitUntil: 'domcontentloaded' })
    } else {
      await page.waitForTimeout(800)
    }
  }
}

/** Open a section from the "More" roll-out, which lists every section. */
async function openSection(page: Page, id: string): Promise<void> {
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.getByRole('button', { name: /^More/ }).first().click()
  const item = page.locator(`[data-section-menu-item="${id}"]`)
  await expect(item).toBeVisible()
  await item.click()
  await page.waitForTimeout(600)
}

/** What the main area is currently showing. */
async function mainText(page: Page): Promise<string> {
  return (await page.locator('[data-wb-region="editor"]').innerText()).slice(0, 200)
}

test.describe('left nav sections', () => {
  // The roll-out lists every section, so it needs the height of a real desktop
  // window — on a short viewport the lower entries can't be scrolled into view.
  test.use({ viewport: { width: 1440, height: 1000 } })

  test.beforeEach(async ({ page }) => {
    await setupTestAuth(page, BASE)
    await advanceOnboarding(page)
    await expect(page.locator('[data-wb-region="sidebar"]')).toBeVisible()
  })

  test('every section changes the main area', async ({ page }) => {
    // The unified nav's full section set. `analytics` is deliberately absent:
    // it is compiled out unless VITE_TELEMETRY_DASHBOARD is set, rather than
    // present and always dead-ending.
    const sections = [
      'all',
      'docs',
      'chats',
      'inbox',
      'tasks',
      'people',
      'views',
      'ai',
      'meetings',
      'discover',
      'finance',
      'companion',
      'experiments',
      'social-import'
    ]

    const seen = new Set<string>()
    for (const id of sections) {
      await openSection(page, id)
      const after = `${page.url().replace(BASE, '')}::${await mainText(page)}`
      expect(seen.has(after), `section "${id}" landed somewhere already visited`).toBe(false)
      seen.add(after)
    }
  })

  test('People and Views reach the surfaces the 0353 rewrite orphaned', async ({ page }) => {
    await openSection(page, 'people')
    await expect(page).toHaveURL(/\/crm$/)

    await openSection(page, 'views')
    await expect(page).toHaveURL(/\/data$/)
  })

  test('the three home lenses repaint / without leaving it', async ({ page }) => {
    await openSection(page, 'docs')
    await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
    const docs = await mainText(page)

    await openSection(page, 'chats')
    await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
    expect(await mainText(page)).not.toBe(docs)
  })

  test('exactly one section is marked current', async ({ page }) => {
    // The pre-0388 predicate could light none (a non-pinned lens) or leave the
    // sidebar claiming Views while the main area showed Meetings.
    for (const id of ['docs', 'inbox', 'people', 'meetings']) {
      await openSection(page, id)
      await page.getByRole('button', { name: /^More/ }).first().click()
      const current = page.locator('[data-sections-menu] [aria-current="page"]')
      await expect(current, `after opening "${id}"`).toHaveCount(1)
      await expect(current).toHaveAttribute('data-section-menu-item', id)
    }
  })

  test('a lens section never strands you on the previous route', async ({ page }) => {
    await openSection(page, 'finance')
    await expect(page).toHaveURL(/\/finance$/)

    await openSection(page, 'docs')
    await expect(page).not.toHaveURL(/\/finance$/)
  })
})
