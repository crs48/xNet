/**
 * Settings data portability E2E (exploration 0344).
 *
 * Proves the product promise end-to-end in the real app against real OPFS
 * SQLite: Settings → Data → "Export data" downloads a signed `.xnetpack`
 * bundle, and a CLEAN browser profile restores it via "Restore from
 * bundle". The test-bypass identity is deterministic
 * (packages/identity/src/passkey/test-bypass.ts), so the fresh profile has
 * the same DID and the bundle's owner check stays enforced — exactly the
 * "same identity, new machine" scenario.
 *
 * Runs in the nightly soak lane (app-regression specs) against the dev
 * server at PLAYWRIGHT_TEST_BASE_URL.
 */

import { mkdtempSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'

async function openDataSettings(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/settings?section=data`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Export data', { exact: true })).toBeVisible({ timeout: 30000 })
}

async function newAuthedPage(browser: Browser): Promise<Page> {
  // A fresh context = a clean profile: empty OPFS, empty IndexedDB.
  const context = await browser.newContext()
  const page = await context.newPage()
  await setupTestAuth(page, BASE_URL)
  // The bypass replaces WebAuthn but onboarding still needs the click —
  // "Get started" creates the deterministic test identity.
  for (let i = 0; i < 8; i++) {
    const start = page.getByRole('button', { name: /Get started/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.getByText(/You're all set!/i).waitFor({ state: 'visible', timeout: 20000 })
      break
    }
    await page.waitForTimeout(1000)
  }
  return page
}

test.describe('data portability (settings export/restore)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium')

  test('export downloads a .xnetpack; a clean profile restores it', async ({ browser }) => {
    test.setTimeout(180_000)
    const downloadDir = mkdtempSync(join(tmpdir(), 'xnetpack-e2e-'))

    // ── Profile A: reach settings and export ─────────────────────────────
    const pageA = await newAuthedPage(browser)
    await openDataSettings(pageA)

    const exportButton = pageA
      .locator('div', { hasText: 'Export data' })
      .getByRole('button', { name: /^Export$/ })
      .first()
    await expect(exportButton).toBeEnabled({ timeout: 30000 })

    const downloadPromise = pageA.waitForEvent('download', { timeout: 60000 })
    await exportButton.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.xnetpack$/)
    const bundlePath = join(downloadDir, download.suggestedFilename())
    await download.saveAs(bundlePath)
    const { size } = await stat(bundlePath)
    // A real bundle has a manifest + at least the identity's own changes.
    expect(size).toBeGreaterThan(500)
    await pageA.context().close()

    // ── Profile B (clean): restore the bundle ────────────────────────────
    const pageB = await newAuthedPage(browser)
    await openDataSettings(pageB)

    const fileInput = pageB.locator('input[type="file"][accept*=".xnetpack"]')
    await expect(fileInput).toBeAttached({ timeout: 30000 })
    await fileInput.setInputFiles(bundlePath)

    // The verify-then-replay report: restored N changes (N > 0 on a clean
    // profile — the exported profile/bootstrap changes were not present).
    const report = pageB.getByText(/Restored \d+ change|failed verification/i)
    await expect(report).toBeVisible({ timeout: 60000 })
    const text = (await report.textContent()) ?? ''
    expect(text).not.toMatch(/failed verification/i)
    expect(text).toMatch(/Restored [1-9]\d* change/)
    await pageB.context().close()
  })
})
