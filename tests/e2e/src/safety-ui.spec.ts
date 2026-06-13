/**
 * E2E coverage for the discovery + safety UI integration (exploration 0176).
 *
 * Drives the real web app (via the test-bypass identity) to prove the wiring
 * the unit tests can't: the Discover front door, the Content & Safety settings,
 * and the onboarding flow are reachable and render.
 */
import { expect, test, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'

/** Click through the passkey-bypass onboarding into the workbench. */
async function advanceOnboarding(page: Page): Promise<void> {
  const rail = page.locator('nav button[aria-label="Discover people"]')
  for (let i = 0; i < 10; i++) {
    if ((await rail.count()) > 0) return
    const start = page.getByRole('button', { name: /Get started/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(1500)
      // The sqlite worker often times out on first headless load; one reload
      // settles it into the authenticated workbench (see worktree render recipe).
      await page.reload({ waitUntil: 'domcontentloaded' })
    } else {
      await page.waitForTimeout(800)
    }
  }
}

test.describe('Discovery + safety UI (0176)', () => {
  test.skip(({ browserName, isMobile }) => browserName === 'webkit' || isMobile)

  test('Discover is reachable from the Rail and renders the matching surface', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    const discover = page.locator('nav button[aria-label="Discover people"]')
    await expect(discover).toBeVisible()
    await discover.click()

    await expect(page.getByRole('heading', { name: /Discover people/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Your matching profile/i })).toBeVisible()
    // Intent chips from connectionIntentKinds (also appear in the profile
    // editor's "Open to" toggles, so scope to the first match).
    await expect(page.getByRole('button', { name: 'Friendship' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Project collaborators' }).first()).toBeVisible()
  })

  test('Content & Safety settings expose the per-label dial and safety center', async ({
    page
  }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await page.goto(`${BASE}/settings`)
    await page.getByRole('button', { name: /Content & Safety/i }).click()

    await expect(page.getByRole('heading', { name: /Content & Safety/i })).toBeVisible()
    await expect(page.getByText(/Adult content/i)).toBeVisible()
    // Safety center (blocked accounts + report log) renders below the dial.
    await expect(page.getByRole('heading', { name: /Safety center/i })).toBeVisible()
  })

  test('the /welcome onboarding wizard runs through its steps', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await page.goto(`${BASE}/welcome`)
    await expect(page.getByText(/Are you 18 or older/i)).toBeVisible()
    await page.getByRole('button', { name: /Yes, I'm 18\+/i }).click()
    await expect(
      page.getByRole('heading', { name: /What content would you like to see/i })
    ).toBeVisible()
    await page.getByRole('button', { name: /Standard/i }).click()
    await expect(page.getByRole('heading', { name: /Open to meeting people/i })).toBeVisible()
  })
})
