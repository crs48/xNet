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

/**
 * A real Ed25519-signed `PolicyBlockList` (generated via generateIdentity +
 * signPolicyBlockList). The signature is over the canonical list, so the import
 * UI verifies it before applying. zSpammer (reject) → blocked, zNoise (hide) →
 * muted. Kept inline so the spec stays self-contained.
 */
const SIGNED_BLOCKLIST_FIXTURE = JSON.stringify({
  v: 1,
  kind: 'xnet.policy.block-list',
  createdAt: 1000,
  updatedAt: 1000,
  id: 'community-blocks',
  scope: 'community',
  issuerDID: 'did:key:z6Mkk4TrBu9RNcCWb6HK2Hb3EjJSFqkNg5kFSfAtPE68FStZ',
  entries: [
    {
      subject: 'did:key:zSpammer',
      subjectType: 'did',
      action: 'reject',
      reason: 'spam',
      createdAt: 1000
    },
    {
      subject: 'did:key:zNoise',
      subjectType: 'did',
      action: 'hide',
      reason: 'noise',
      createdAt: 1000
    }
  ],
  signature: {
    alg: 'Ed25519',
    value:
      '2aLdhT/L3OE2HkT7YP5+RKJgRovL6qySLlAqQyFuGeQmgIfifOJyUmqPHTIL9LrqBBq9+pygKWhoCjPzVtynAg=='
  }
})

/** Click through the passkey-bypass onboarding into the shell. */
async function advanceOnboarding(page: Page): Promise<void> {
  // Shell-neutral readiness signal: the home surface's "All Documents" heading
  // renders in both the workbench and the calm shell (0250), so this works
  // regardless of the active layout default.
  const ready = page.getByRole('heading', { name: /all documents/i })
  for (let i = 0; i < 10; i++) {
    if ((await ready.count()) > 0) return
    const start = page.getByRole('button', { name: /Get started/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(1500)
      // The sqlite worker often times out on first headless load; one reload
      // settles it into the authenticated shell (see worktree render recipe).
      await page.reload({ waitUntil: 'domcontentloaded' })
    } else {
      await page.waitForTimeout(800)
    }
  }
}

/**
 * Open a people/social surface from whichever primary nav the active shell
 * shows: the Floating shell's sidebar islands (0286 — Inbox is a pinned primary
 * row; Discover lives in the "More" surfaces roll-out), the legacy workbench
 * Rail, or the calm shell's ModeSwitch → Network mode. Keeps this spec green
 * under any layout default.
 */
async function openSocialSurface(
  page: Page,
  r:
    | { railLabel: 'Discover people'; calmHome: true }
    | { railLabel: 'Requests'; calmHome: false; calmLink: RegExp }
): Promise<void> {
  // Floating shell (0286): the two-island sidebar.
  const floatingSidebar = page.locator('[data-wb-region="sidebar"]')
  if ((await floatingSidebar.count()) > 0) {
    if (r.railLabel === 'Requests') {
      // The Inbox surface (→ /requests) is a pinned primary row.
      await floatingSidebar.getByRole('button', { name: 'Inbox' }).first().click()
    } else {
      // Discover is not pinned by default — reach it from the "More" roll-out.
      await floatingSidebar.getByRole('button', { name: /^More/ }).first().click()
      await page.getByRole('button', { name: 'Discover', exact: true }).first().click()
    }
    return
  }
  const railButton = page.locator(`nav button[aria-label="${r.railLabel}"]`)
  if ((await railButton.count()) > 0) {
    await railButton.first().click()
    return
  }
  // Calm shell: enter Network mode (lands on Discover), then click the list
  // entry if a deeper surface was requested.
  await page.locator('nav button[aria-label="Network"]').first().click()
  if (!r.calmHome) {
    await page.getByRole('link', { name: r.calmLink }).first().click()
  }
}

test.describe('Discovery + safety UI (0176)', () => {
  test.skip(({ browserName, isMobile }) => browserName === 'webkit' || isMobile)

  test('Discover is reachable from the primary nav and renders the matching surface', async ({
    page
  }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await openSocialSurface(page, { railLabel: 'Discover people', calmHome: true })

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

  test('a signed shared blocklist can be imported from the Safety center', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await page.goto(`${BASE}/settings`)
    await page.getByRole('button', { name: /Content & Safety/i }).click()

    await expect(page.getByRole('heading', { name: /Shared blocklists/i })).toBeVisible()
    await page.getByLabel('Signed blocklist JSON').fill(SIGNED_BLOCKLIST_FIXTURE)
    await page.getByRole('button', { name: /Verify & import/i }).click()

    // Signature verified → both accounts applied (reject→blocked, hide→muted).
    await expect(page.getByText(/Imported 2 account\(s\)/i)).toBeVisible()
    await expect(page.getByText(/Blocked/).first()).toBeVisible()
  })

  test('a moderation labeler can be subscribed to from the Safety center', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await page.goto(`${BASE}/settings`)
    await page.getByRole('button', { name: /Content & Safety/i }).click()

    await expect(page.getByRole('heading', { name: /Subscribed labelers/i })).toBeVisible()
    await page.getByLabel('Labeler DID').fill('did:key:zE2ELabeler')
    await page.getByLabel('Trust level').selectOption({ label: 'Trusted (strong)' })
    await page.getByRole('button', { name: 'Subscribe' }).click()

    // The subscription persists and renders with its DID + a Remove control.
    await expect(page.getByText('did:key:zE2ELabeler')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()
  })

  test('the Requests inbox is reachable from the primary nav (first-contact)', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await openSocialSurface(page, {
      railLabel: 'Requests',
      calmHome: false,
      calmLink: /Requests/i
    })
    await expect(page.getByRole('heading', { name: /Message requests/i })).toBeVisible()
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
