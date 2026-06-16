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
  },

  // The quote-to-cash UI (Products catalog + the in-inspector line-item builder)
  // is tab- and inspector-gated and needs seed data, so a static /crm route shot
  // can't see it -- this flow drives it into a GIF. Every step is best-effort:
  // run() must reach its end so capture.mjs finalizes the recording, so we click
  // through `tryClick` and swallow any single missing step rather than throwing.
  'crm-quote': {
    label: 'Build a CRM quote (product + line item)',
    async run(page) {
      const tryClick = async (name) => {
        try {
          await page.getByRole('button', { name }).first().click({ timeout: 5000 })
        } catch {
          /* best-effort: a missing control must not abort the recording */
        }
      }

      await page.goto(new URL('/crm', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000
      })
      await wait(page, 800)

      // Products tab: seed a product so the catalog table (not the empty state) shows.
      await tryClick(/^Products$/)
      await wait(page, 500)
      await tryClick(/New product/i)
      await wait(page, 900)

      // Pipeline tab: seed a deal, then open its inspector -- the line-item
      // builder lives in the Deal inspector's "Line items" panel.
      await tryClick(/^Pipeline$/)
      await wait(page, 800)
      await tryClick(/New deal/i)
      await wait(page, 900)
      // The "Deal details" opener is opacity-0 until hover, but opacity:0 is
      // still clickable in Playwright; hover first so the GIF shows it appear.
      try {
        await page.getByLabel('Deal details').first().hover({ timeout: 4000 })
      } catch {
        /* hover is cosmetic */
      }
      await tryClick(/Deal details/i)
      await wait(page, 1200)
    }
  }
}
