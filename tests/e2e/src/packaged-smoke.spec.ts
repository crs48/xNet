/**
 * Packaged-app smoke (exploration 0238, L4).
 *
 * The release artifact is the least-tested thing we ship: `electron-release.yml`
 * builds DMG/ZIP/NSIS/AppImage/DEB and publishes them WITHOUT ever launching the
 * binary. A native-module rebuild miss or ASAR/path bug yields an app that won't
 * open — and we'd find out from users.
 *
 * This spec launches the BUILT binary (`electron.launch({ executablePath })`) and
 * asserts it opens and reaches a healthy state (renderer mounted, store wired,
 * past any "Initializing"). The release workflow runs it after each platform
 * build and BEFORE publish, so a dead artifact fails the release instead of
 * shipping.
 *
 * Skips unless `XNET_PACKAGED_BINARY` points at the binary inside the artifact.
 *   XNET_PACKAGED_BINARY=/path/to/xNet \
 *     pnpm --filter @xnetjs/e2e-tests exec playwright test src/packaged-smoke.spec.ts --project=electron
 */
import { expect, test } from '@playwright/test'
import { launchElectronApp } from './lib/sync-harness'

const PACKAGED_BINARY = process.env.XNET_PACKAGED_BINARY

interface E2EWindow {
  __xnetNodeStore?: unknown
}

test.describe('Packaged Electron app smoke (0238 L4)', () => {
  test.setTimeout(180_000)
  test.skip(
    !PACKAGED_BINARY,
    'set XNET_PACKAGED_BINARY to the built binary path to run the packaged-app smoke'
  )

  test('packaged binary launches and reaches a healthy state', async () => {
    const { app, window: win } = await launchElectronApp({
      executablePath: PACKAGED_BINARY,
      profile: `e2e-packaged-${Date.now()}`
    })
    try {
      // The window opens and the renderer mounts (not a white screen).
      await expect(win.locator('#root')).toBeVisible({ timeout: 60_000 })
      // Healthy = the React tree finished wiring the node store, past loading.
      await win.waitForFunction(
        () => Boolean((window as unknown as E2EWindow).__xnetNodeStore),
        undefined,
        { timeout: 60_000 }
      )
      await expect(win.getByText(/Initializing/i)).toHaveCount(0, { timeout: 30_000 })
    } finally {
      await app.close()
    }
  })
})
