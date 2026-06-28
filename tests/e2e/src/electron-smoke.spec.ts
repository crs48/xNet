/**
 * Electron app e2e via Playwright's first-class `_electron.launch()`
 * (exploration 0238, L3) — the supported replacement for the bespoke
 * "spawn electron-vite dev + poll a CDP port + connectOverCDP" harness that the
 * retired `electron-canvas.spec.ts` used.
 *
 * Proves the Electron-specific seams the web app never exercises:
 *   1. Launch smoke — the app opens, the renderer mounts, no "Initializing".
 *   2. No uncaught errors at boot (page errors + non-benign console errors).
 *   3. SQLite durability — a node created in one launch survives a restart
 *      (renderer → IPC → data-process → better-sqlite3 round trip).
 *   4. `xnet://` deep-link routing — a main-process `open-url` reaches the
 *      renderer with the validated payload.
 *
 * Runs only in the `electron` Playwright project. Not part of `pnpm test`.
 *   cd tests/e2e && pnpm exec playwright test src/electron-smoke.spec.ts --project=electron
 */
import { expect, test, type Page } from '@playwright/test'
import { electronRendererBuilt, launchElectronApp } from './lib/sync-harness'

// Benign console noise we don't want to fail a boot on: CDP/devtools chatter and
// the hub-unreachable network errors expected when no hub is running (L2 is what
// proves real hub connectivity — L3 only proves the app itself boots cleanly).
const BENIGN_CONSOLE =
  /Autofill|DevTools|Download the React|net::ERR|ERR_CONNECTION|WebSocket|ECONNREFUSED|favicon|ResizeObserver|hub|sync/i

interface E2EWindow {
  __xnetNodeStore?: {
    create: (input: { schemaId: string; properties: Record<string, unknown> }) => Promise<{
      id: string
    }>
    get: (id: string) => Promise<{ properties?: { title?: unknown } } | null>
  }
  __xnetSchemaIds?: Record<string, string>
  __xnetLastCloudConnect?: unknown
}

test.describe('Electron app smoke (0238 L3)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)

  test.skip(
    !electronRendererBuilt(),
    'electron app not built — run `pnpm --filter xnet-desktop build` (+ deps:electron) first'
  )

  /** Renderer is mounted once #root is visible and the node store is wired. */
  async function waitForRenderer(win: Page): Promise<void> {
    await expect(win.locator('#root')).toBeVisible({ timeout: 60_000 })
    await win.waitForFunction(
      () => Boolean((window as unknown as E2EWindow).__xnetNodeStore),
      undefined,
      {
        timeout: 60_000
      }
    )
    await expect(win.getByText(/Initializing/i)).toHaveCount(0, { timeout: 30_000 })
  }

  async function advanceOnboardingIfNeeded(win: Page): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
      const getStarted = win.getByRole('button', { name: /Get started with/i })
      if ((await getStarted.count()) > 0 && (await getStarted.first().isVisible())) {
        await getStarted.first().click()
        await win.waitForTimeout(800)
        continue
      }
      const createFirst = win.getByRole('button', { name: /Create your first page/i })
      if ((await createFirst.count()) > 0 && (await createFirst.first().isVisible())) {
        await createFirst.first().click()
        await win.waitForTimeout(800)
        continue
      }
      break
    }
  }

  const canvasNodeCount = (win: Page, type: string): Promise<number> =>
    win.locator(`.canvas-node[data-node-type="${type}"]`).count()

  /** Create a canvas object via its dock button, with a keyboard-shortcut fallback. */
  async function createCanvasObject(win: Page, kind: 'page' | 'database' | 'note'): Promise<void> {
    const target = (await canvasNodeCount(win, kind)) + 1
    await win
      .locator(`[data-action-dock="canvas-home"] [data-action-dock-button="${kind}"]`)
      .click({ force: true })
    try {
      await expect.poll(() => canvasNodeCount(win, kind), { timeout: 2500 }).toBe(target)
    } catch {
      const surface = win.locator('[data-canvas-surface="true"]')
      await expect(surface).toBeVisible({ timeout: 30_000 })
      await surface.click({ position: { x: 220, y: 240 }, force: true })
      await surface.focus()
      await win.keyboard.press(kind === 'page' ? 'P' : kind === 'database' ? 'D' : 'N')
      await expect.poll(() => canvasNodeCount(win, kind), { timeout: 30_000 }).toBe(target)
    }
  }

  test('launches and mounts the renderer with no uncaught errors at boot', async () => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const { app, window: win } = await launchElectronApp({ profile: `e2e-smoke-${Date.now()}` })
    win.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    win.on('pageerror', (err) => pageErrors.push(err.message))

    try {
      await waitForRenderer(win)
      // Let late async boot work (sync start, telemetry hydrate) settle.
      await win.waitForTimeout(1500)

      const realConsoleErrors = consoleErrors.filter((text) => !BENIGN_CONSOLE.test(text))
      expect(pageErrors, `uncaught errors at boot:\n${pageErrors.join('\n')}`).toEqual([])
      expect(realConsoleErrors, `console errors at boot:\n${realConsoleErrors.join('\n')}`).toEqual(
        []
      )
    } finally {
      await app.close()
    }
  })

  test('persists a node to SQLite across a restart', async () => {
    // Stable, unique profile so both launches share one on-disk database.
    const profile = `e2e-persist-${Date.now()}`
    const title = `persist-me-${Date.now()}`

    const first = await launchElectronApp({ profile })
    let createdId: string
    try {
      await waitForRenderer(first.window)
      createdId = await first.window.evaluate(async (nodeTitle) => {
        const w = window as unknown as E2EWindow
        const store = w.__xnetNodeStore
        const schemaId = w.__xnetSchemaIds?.page
        if (!store || !schemaId) throw new Error('node store / schema ids not available')
        const node = await store.create({ schemaId, properties: { title: nodeTitle } })
        return node.id
      }, title)
      // Let the IPC write flush through the data process to better-sqlite3.
      await first.window.waitForTimeout(750)
    } finally {
      await first.app.close()
    }

    const second = await launchElectronApp({ profile })
    try {
      await waitForRenderer(second.window)
      const persistedTitle = await second.window.evaluate(async (id) => {
        const store = (window as unknown as E2EWindow).__xnetNodeStore
        if (!store) throw new Error('node store not available')
        const node = await store.get(id)
        return node?.properties?.title ?? null
      }, createdId)
      expect(persistedTitle).toBe(title)
    } finally {
      await second.app.close()
    }
  })

  test('routes an xnet:// deep link from the main process to the renderer', async () => {
    const { app, window: win } = await launchElectronApp({ profile: `e2e-deeplink-${Date.now()}` })
    try {
      await waitForRenderer(win)

      // Re-emit the OS deep-link event the main process's `open-url` handler
      // listens for; `wss://demo.xnet.fyi` is on the hub host allowlist.
      const url = 'xnet://connect?hub=wss://demo.xnet.fyi&code=ABCD-7K2P'
      await app.evaluate(({ app: electronApp }, deepLink) => {
        electronApp.emit('open-url', { preventDefault() {} }, deepLink)
      }, url)

      const received = await win.evaluate(async () => {
        for (let i = 0; i < 80; i += 1) {
          const value = (window as unknown as E2EWindow).__xnetLastCloudConnect
          if (value) return value
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return null
      })
      expect(received).toEqual({ hub: 'wss://demo.xnet.fyi', code: 'ABCD-7K2P' })
    } finally {
      await app.close()
    }
  })

  test('creates page, database, and note objects on the canvas (core flow)', async () => {
    const { app, window: win } = await launchElectronApp({ profile: `e2e-canvas-${Date.now()}` })
    try {
      await waitForRenderer(win)
      await advanceOnboardingIfNeeded(win)
      await expect(
        win.locator('[data-action-dock="canvas-home"] [data-action-dock-button="page"]')
      ).toBeVisible({ timeout: 30_000 })

      await createCanvasObject(win, 'page')
      await createCanvasObject(win, 'database')
      await createCanvasObject(win, 'note')

      expect(await canvasNodeCount(win, 'page')).toBeGreaterThanOrEqual(1)
      expect(await canvasNodeCount(win, 'database')).toBeGreaterThanOrEqual(1)
      expect(await canvasNodeCount(win, 'note')).toBeGreaterThanOrEqual(1)
    } finally {
      await app.close()
    }
  })
})
