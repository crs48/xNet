/**
 * Interaction flows recorded as video for Phase 4. Each flow receives an
 * authenticated Playwright `page` already on the app home and drives a short,
 * deterministic interaction. Keep them SHORT -- every second is GIF bytes.
 *
 * Flow ids must match `flows[].id` in manifests.json. A flow that throws is
 * skipped (the capture job is informational, never blocking).
 */

const wait = (page, ms) => page.waitForTimeout(ms)

/** Click "New" -> "<label>" from the workbench main area, tolerating onboarding. */
async function newFromMenu(page, label) {
  const main = page.getByRole('main')
  await main.getByRole('button', { name: /^New$/i }).click()
  await main.getByRole('button', { name: new RegExp(`^${label}$`) }).click()
}

export const FLOWS = {
  'create-page': {
    label: 'Create a page and use the editor',
    async run(page) {
      await newFromMenu(page, 'Page')
      await page.waitForURL(/\/doc\//, { timeout: 30_000 })
      const editor = page.locator('[contenteditable="true"]').first()
      await editor.click()
      for (const chunk of ['# Release notes', '\n', 'Visual capture demo — typed by CI.']) {
        await page.keyboard.type(chunk, { delay: 40 })
      }
      await wait(page, 600)
      // Show the selection toolbar: select the heading.
      await page.keyboard.down('Shift')
      for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowLeft')
      await page.keyboard.up('Shift')
      await wait(page, 800)
    }
  },

  canvas: {
    label: 'Open a canvas',
    async run(page) {
      await newFromMenu(page, 'Canvas')
      await page.waitForURL(/\/canvas\//, { timeout: 30_000 })
      await wait(page, 1200)
    }
  }
}
