import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')
const ELECTRON_PROFILE = 'e2e-canvas'
const ELECTRON_CDP_PORT = 9225
const RENDERER_PORT = 5178
const ELECTRON_CDP_URL = `http://127.0.0.1:${ELECTRON_CDP_PORT}`
const RENDERER_URL = `http://127.0.0.1:${RENDERER_PORT}`
const COMMAND_PALETTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P'
const ELECTRON_PROFILE_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  `xnet-desktop-${ELECTRON_PROFILE}`
)

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Electron CDP validation only runs on Chromium'
)

function spawnElectronDev(): ChildProcess {
  return spawn('pnpm', ['exec', 'electron-vite', 'dev'], {
    cwd: `${ROOT}/apps/electron`,
    env: {
      ...process.env,
      ELECTRON_CDP_PORT: String(ELECTRON_CDP_PORT),
      VITE_PORT: String(RENDERER_PORT),
      XNET_PROFILE: ELECTRON_PROFILE,
      XNET_TEST_BYPASS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: true
  })
}

function killTree(proc: ChildProcess | null): void {
  if (!proc) return

  try {
    if (proc.pid) {
      process.kill(-proc.pid, 'SIGTERM')
      return
    }
  } catch {
    // fall through
  }

  try {
    proc.kill('SIGTERM')
  } catch {
    // already dead
  }
}

async function waitForCdpReady(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ELECTRON_CDP_URL}/json/version`)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }

    await sleep(500)
  }

  throw new Error(`Timed out waiting for Electron CDP endpoint on ${ELECTRON_CDP_URL}`)
}

async function waitForRendererReady(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(RENDERER_URL)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }

    await sleep(500)
  }

  throw new Error(`Timed out waiting for Electron renderer dev server on ${RENDERER_URL}`)
}

async function waitForElectronPage(browser: Browser, timeoutMs = 60_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const pages = browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter((page) => !page.url().startsWith('devtools://'))

    const page = pages.find((candidate) => candidate.url() !== 'about:blank')
    if (page) {
      await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs })
      await page.bringToFront()
      return page
    }

    await sleep(250)
  }

  throw new Error('Timed out waiting for the Electron renderer page')
}

async function advanceOnboardingIfNeeded(page: Page): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    const getStartedButton = page.getByRole('button', { name: /Get started with/i })
    if ((await getStartedButton.count()) > 0 && (await getStartedButton.first().isVisible())) {
      await getStartedButton.first().click()
      await sleep(800)
      continue
    }

    const createFirstPageButton = page.getByRole('button', { name: /Create your first page/i })
    if (
      (await createFirstPageButton.count()) > 0 &&
      (await createFirstPageButton.first().isVisible())
    ) {
      await createFirstPageButton.first().click()
      await sleep(800)
      continue
    }

    break
  }
}

async function waitForCanvasShell(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Page' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /hide minimap/i })).toBeVisible({
    timeout: 30_000
  })
}

test.describe('Electron canvas shell', () => {
  test.describe.configure({ mode: 'serial' })

  let electronProc: ChildProcess | null = null
  let electronBrowser: Browser | null = null
  let electronPage: Page | null = null

  test.beforeAll(async () => {
    rmSync(ELECTRON_PROFILE_PATH, { recursive: true, force: true })

    electronProc = spawnElectronDev()
    await waitForCdpReady()
    await waitForRendererReady()
    electronBrowser = await chromium.connectOverCDP(ELECTRON_CDP_URL)
    electronPage = await waitForElectronPage(electronBrowser)

    if (process.env.E2E_DEBUG) {
      electronPage.on('console', (message) => {
        process.stderr.write(`[electron:console] ${message.type()}: ${message.text()}\n`)
      })
    }

    await advanceOnboardingIfNeeded(electronPage)
    await waitForCanvasShell(electronPage)
  })

  test.afterAll(async () => {
    if (electronBrowser) {
      await electronBrowser.close()
    }

    killTree(electronProc)
    await sleep(1_000)
    rmSync(ELECTRON_PROFILE_PATH, { recursive: true, force: true })

    for (const port of [ELECTRON_CDP_PORT, RENDERER_PORT]) {
      try {
        execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
      } catch {
        // port already clear
      }
    }
  })

  test('creates page, database, and note objects while keeping the home shell lightweight', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!

    await page.getByRole('button', { name: 'Page' }).click({ force: true })
    await expect(page.getByText('Untitled Page')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Database' }).click({ force: true })
    await expect(page.getByText('Untitled Database')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Note' }).click({ force: true })
    await expect(page.getByText('Untitled Note')).toBeVisible({ timeout: 30_000 })

    await page.keyboard.press(COMMAND_PALETTE_SHORTCUT)
    const commandInput = page.getByPlaceholder('Type a command or search...')
    await expect(commandInput).toBeVisible({ timeout: 10_000 })
    await commandInput.fill('Create Page')
    await page.keyboard.press('Enter')

    await expect(page.getByText('Untitled Page')).toHaveCount(2, { timeout: 30_000 })

    await page.getByRole('button', { name: /hide minimap/i }).click({ force: true })
    await expect(page.getByRole('button', { name: /show minimap/i })).toBeVisible()
    await page.getByRole('button', { name: /show minimap/i }).click({ force: true })
    await expect(page.getByRole('button', { name: /hide minimap/i })).toBeVisible()

    const shellMetrics = await page.evaluate(() => ({
      canvasElements: document.querySelectorAll('canvas').length,
      contentEditableElements: document.querySelectorAll('[contenteditable="true"]').length,
      tableElements: document.querySelectorAll('table').length
    }))

    expect(shellMetrics.canvasElements).toBeGreaterThanOrEqual(2)
    expect(shellMetrics.contentEditableElements).toBe(0)
    expect(shellMetrics.tableElements).toBe(0)

    await page.screenshot({
      path: `${ROOT}/tmp/playwright/electron-canvas-shell.png`,
      fullPage: true
    })
  })
})
