/**
 * Cross-client convergence matrix (exploration 0238, L2).
 *
 * Generalises `doc-sync.spec.ts` (web↔web only) into the full matrix the
 * exploration asks for:
 *
 *     web ⇄ web · electron ⇄ web · electron ⇄ electron
 *       × ws / webrtc  × online / offline→reconnect
 *
 * One in-process hub (`--no-auth --storage memory`) + one Vite web harness back
 * every cell. Each cell opens two `SyncClient`s on a fresh doc id, asserts text
 * converges in BOTH directions, then asserts an edit made while one side is
 * OFFLINE catches up after it reconnects.
 *
 * Project routing (see playwright.config.ts):
 *   - `chromium` project  → runs the pure web↔web cells.
 *   - `electron` project  → runs the electron↔web and electron↔electron cells
 *     (it has the native rebuild + headless GUI). The web half of an
 *     electron↔web cell still uses the project's default Chromium browser.
 *
 * WebRTC note: the Electron utility process is WS-relay only, so `webrtc` cells
 * REQUEST WebRTC and converge over the WS fallback — exactly the exploration's
 * "best effort / allowed to fall back to WS, must still converge" contract.
 *
 * Not part of `pnpm test`; run via the `electron-e2e` CI job or:
 *   cd tests/e2e && pnpm exec playwright test src/sync-matrix.spec.ts --project=electron
 */
import { expect, test } from '@playwright/test'
import {
  electronRendererBuilt,
  openClient,
  startInProcessHub,
  startWebHarness,
  type ClientKind,
  type InProcessHub,
  type SyncClient,
  type Transport,
  type WebHarness
} from './lib/sync-harness'

const MATRIX: Array<[ClientKind, ClientKind]> = [
  ['web', 'web'],
  ['electron', 'web'],
  ['electron', 'electron']
]
const TRANSPORTS: Transport[] = ['ws', 'webrtc']

test.describe('Cross-client convergence matrix (0238 L2)', () => {
  test.describe.configure({ mode: 'serial' })

  let hub: InProcessHub
  let harness: WebHarness

  test.beforeAll(async () => {
    hub = await startInProcessHub()
    harness = await startWebHarness()
  })

  test.afterAll(async () => {
    await harness?.stop()
    await hub?.stop()
  })

  for (const [a, b] of MATRIX) {
    for (const transport of TRANSPORTS) {
      test(`converges: ${a} ⇄ ${b} over ${transport}`, async ({ browser }, testInfo) => {
        const involvesElectron = a === 'electron' || b === 'electron'
        const isElectronProject = testInfo.project.name === 'electron'
        // Electron cells run only in the electron project; pure web↔web only in
        // the browser projects — so neither double-runs nor runs where it can't.
        test.skip(
          involvesElectron !== isElectronProject,
          involvesElectron
            ? 'electron cell runs only in the electron project'
            : 'web↔web cell runs only in browser projects'
        )
        test.skip(
          involvesElectron && !electronRendererBuilt(),
          'electron app not built — run `pnpm --filter xnet-desktop build` (+ deps:electron) first'
        )
        if (involvesElectron) test.setTimeout(240_000)

        const docId = `sync-matrix-${transport}-${Date.now()}`
        const clients: SyncClient[] = []
        try {
          const c1 = await openClient(a, {
            browser,
            webBaseUrl: harness.baseUrl,
            hubWs: hub.wsUrl,
            user: 1,
            docId,
            transport
          })
          clients.push(c1)
          const c2 = await openClient(b, {
            browser,
            webBaseUrl: harness.baseUrl,
            hubWs: hub.wsUrl,
            user: 2,
            docId,
            transport
          })
          clients.push(c2)

          // ── 1 → 2 ────────────────────────────────────────────────────────
          await c1.type('hello from one')
          if (process.env.E2E_DEBUG) {
            // eslint-disable-next-line no-console
            console.log(
              `[matrix] ${a}→${b} after type: c1=${JSON.stringify(await c1.text())} c2=${JSON.stringify(await c2.text())}`
            )
          }
          await expect
            .poll(() => c2.text(), { timeout: 30_000, message: `${a}→${b} forward sync` })
            .toContain('hello from one')

          // ── 2 → 1 ────────────────────────────────────────────────────────
          await c2.type(' and two')
          await expect
            .poll(() => c1.text(), { timeout: 30_000, message: `${b}→${a} reverse sync` })
            .toContain('and two')

          // ── offline → reconnect catch-up ─────────────────────────────────
          await c1.goOffline()
          await c1.type(' offline edit')
          // Let the offline edit settle into local state before reconnecting.
          await new Promise((resolve) => setTimeout(resolve, 500))
          await c1.goOnline()
          await expect
            .poll(() => c2.text(), { timeout: 45_000, message: 'offline → reconnect catch-up' })
            .toContain('offline edit')

          // ── both ends converge to identical state ────────────────────────
          await expect
            .poll(async () => (await c1.text()) === (await c2.text()), { timeout: 30_000 })
            .toBe(true)
        } finally {
          for (const client of clients) {
            await client.close().catch(() => undefined)
          }
        }
      })
    }
  }
})
