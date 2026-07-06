/**
 * Quiet-surface shell (exploration 0273).
 *
 * With the staged-rollout flag on, a fresh identity boots to the Desk under
 * quiet chrome: bare surface, dimmed corner glyphs, every drawer summonable
 * three ways (pointer, chord, ⌘K) and dismissed by Esc — the disclosure
 * ladder never dead-ends.
 *
 * Summonable-surface audit (0273 validation):
 *
 * | Surface    | Pointer/touch              | Chord | ⌘K command          |
 * | ---------- | -------------------------- | ----- | ------------------- |
 * | Navigator  | left edge hover / swipe    | ⌘B    | Toggle left panel   |
 * | Context    | right edge hover / swipe   | ⌘\    | Toggle right panel  |
 * | Dock       | corner launcher / FAB      | ⌘J    | Dock: <panel>       |
 * | Palette    | corner search glyph        | ⌘K    | —                   |
 */
import { expect, test, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'

async function enableQuietDefault(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('xnet:experiment:quiet-default', '1')
  })
}

async function bootToDesk(page: Page): Promise<void> {
  await enableQuietDefault(page)
  await setupTestAuth(page)

  // Identity creation under test bypass still needs the welcome click-through
  // (same dance as pages-crud.spec.ts) — but NOT "Create your first page",
  // which would break the zero-docs freshness signal. Once the identity
  // exists ("You're all set!"), go straight home instead.
  for (let i = 0; i < 4; i++) {
    const start = page.getByRole('button', { name: /Get started with/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(1000)
      continue
    }
    break
  }
  await expect(page.getByRole('button', { name: /create your first page/i })).toBeVisible({
    timeout: 20_000
  })
  await page.goto(`${BASE}/`)

  // The fresh-identity effect adopts the Desk once the home queries resolve
  // empty; the Desk canvas is created on arrival.
  await page.waitForURL(/\/canvas\/desk-/, { timeout: 30_000 })
}

async function runPaletteCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press(`${MOD}+K`)
  const input = page.getByPlaceholder(/type > for commands/i)
  await expect(input).toBeVisible()
  await input.fill(`>${title}`)
  await page
    .getByRole('option', { name: new RegExp(title, 'i') })
    .first()
    .click()
}

test.describe('quiet-surface shell (0273)', () => {
  // Hover hot-zones and keyboard chords are the desktop grammar; the mobile
  // twins (edge swipes, FAB) are covered by the compact shells' own specs.
  test.skip(({ isMobile }) => Boolean(isMobile), 'desktop quiet posture only')
  test('fresh identity boots to the Desk at L0 — bare surface, dimmed glyphs, no panels', async ({
    page
  }) => {
    await bootToDesk(page)

    // Corner glyphs present but dimmed (opacity class, not removed).
    const corners = page.locator('[data-coach="quiet.corners"]')
    await expect(corners).toBeVisible({ timeout: 20_000 })

    // No overlay is open at rest.
    await expect(page.locator('[data-wb-sheet="left"]')).toHaveCount(0)
    await expect(page.locator('[data-wb-sheet="right"]')).toHaveCount(0)

    // The Desk empty state offers the starter chips.
    await expect(page.locator('[data-web-desk-empty-state="true"]')).toBeVisible({
      timeout: 20_000
    })
  })

  test('disclosure ladder: chords summon overlays, Esc always walks back to L0', async ({
    page
  }) => {
    await bootToDesk(page)
    await expect(page.locator('[data-coach="quiet.corners"]')).toBeVisible({ timeout: 20_000 })

    // ⌘B — navigator overlay.
    await page.keyboard.press(`${MOD}+B`)
    await expect(page.locator('[data-wb-sheet="left"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-wb-sheet="left"]')).toHaveCount(0)

    // ⌘\ — context overlay.
    await page.keyboard.press(`${MOD}+\\`)
    await expect(page.locator('[data-wb-sheet="right"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-wb-sheet="right"]')).toHaveCount(0)

    // ⌘J — the dock panel (floating corner card).
    await page.keyboard.press(`${MOD}+J`)
    await expect(page.locator('[data-wb-region="bottom"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-wb-region="bottom"]')).toHaveCount(0)

    // Repeated Esc at L0 never dead-ends (no dialogs stuck, surface intact).
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.locator('main[data-wb-region="editor"]')).toBeVisible()
  })

  test('edge hot-zone summons the navigator on hover dwell', async ({ page }) => {
    await bootToDesk(page)
    await expect(page.locator('[data-coach="quiet.corners"]')).toBeVisible({ timeout: 20_000 })

    // Glide from the surface centre to the left edge like a real pointer —
    // the hot zone summons after a short dwell.
    const zone = await page.locator('[data-quiet-hotzone="left"]').boundingBox()
    if (!zone) throw new Error('left hot zone missing')
    await page.mouse.move(400, zone.y + zone.height / 2)
    await page.mouse.move(2, zone.y + zone.height / 2, { steps: 8 })
    await expect(page.locator('[data-wb-sheet="left"]')).toBeVisible({ timeout: 5_000 })

    // Esc dismisses — and the cooldown stops the resting pointer from
    // instantly re-summoning what was just dismissed.
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-wb-sheet="left"]')).toHaveCount(0)
    await page.waitForTimeout(400)
    await expect(page.locator('[data-wb-sheet="left"]')).toHaveCount(0)
  })

  test('pin to Desk: a page pinned via the palette lands on the Desk', async ({ page }) => {
    await bootToDesk(page)
    await expect(page.locator('[data-web-desk-empty-state="true"]')).toBeVisible({
      timeout: 20_000
    })

    // Open a page (created on visit), pin it, and return to the Desk.
    await page.goto(`${BASE}/doc/e2e-quiet-pin-target`)
    await expect(page.locator('main[data-wb-region="editor"]')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)

    await runPaletteCommand(page, 'Pin to Desk')
    await runPaletteCommand(page, 'Go to Desk')

    await page.waitForURL(/\/canvas\/desk-/, { timeout: 20_000 })
    // The drained pin means the Desk is no longer empty.
    await expect(page.locator('[data-web-desk-empty-state="true"]')).toHaveCount(0, {
      timeout: 20_000
    })
  })
})
