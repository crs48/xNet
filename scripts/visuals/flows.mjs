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
  },

  // The redesigned chat surface (exploration 0198, PR #174) only renders at the
  // parameterized /channel/$channelId route, behind a seeded channel + messages,
  // so no static route shot can see it -- this flow seeds it. Every step is
  // best-effort (a missing control must not abort the recording): open the Chats
  // panel from the rail, create a channel, post two messages (to show grouping),
  // then hover a row to reveal the action toolbar, react, and open the thread.
  chat: {
    label: 'Open a channel and post a message',
    async run(page) {
      const tryClick = async (target) => {
        try {
          await target.click({ timeout: 5000 })
        } catch {
          /* best-effort */
        }
      }
      const byLabel = (name) => page.getByRole('button', { name }).first()

      // Open the left "Chats" panel from the 44px rail (aria-label="Chats").
      await tryClick(byLabel(/^Chats$/))
      await wait(page, 500)

      // "New channel" (+) -> type a name -> Enter creates the channel.
      await tryClick(byLabel('New channel'))
      const nameInput = page.getByPlaceholder(/channel name/i)
      try {
        await nameInput.fill('visual-demo', { timeout: 4000 })
        await nameInput.press('Enter')
      } catch {
        /* the panel may already have a channel to open */
      }
      await wait(page, 800)

      // Open the channel row we just made (falls back to any channel row).
      await tryClick(byLabel(/visual-demo/i))
      await page.waitForURL(/\/channel\//, { timeout: 15_000 }).catch(() => {})
      await wait(page, 600)

      // Post two messages so grouping + the feed redesign are visible.
      const composer = page.getByPlaceholder(/Message/i).first()
      try {
        await composer.click({ timeout: 5000 })
        await composer.type('Visual capture demo — first message.', { delay: 25 })
        await composer.press('Enter')
        await composer.type('And a second, to show message grouping.', { delay: 25 })
        await composer.press('Enter')
      } catch {
        /* composer may be gated; the channel shell is still worth recording */
      }
      await wait(page, 600)

      // Hover the latest row to reveal the action toolbar, then react + reply.
      try {
        const row = page.getByRole('listitem').last()
        await row.hover({ timeout: 4000 })
        await wait(page, 300)
        await tryClick(byLabel(/add reaction|react/i))
        await tryClick(byLabel(/reply|thread/i))
      } catch {
        /* hover/toolbar is cosmetic */
      }
      await wait(page, 1200)
    }
  }
}
