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
const RENDERER_URLS = [`http://localhost:${RENDERER_PORT}`, `http://127.0.0.1:${RENDERER_PORT}`]
const COMMAND_PALETTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P'
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const ELECTRON_PROFILE_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  `xnet-desktop-${ELECTRON_PROFILE}`
)
const MAX_LOG_LINES = 200

const electronStdoutLines: string[] = []
const electronStderrLines: string[] = []

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Electron CDP validation only runs on Chromium'
)

function appendLogLine(buffer: string[], line: string): void {
  buffer.push(line)
  if (buffer.length > MAX_LOG_LINES) {
    buffer.splice(0, buffer.length - MAX_LOG_LINES)
  }
}

function attachLogCollector(
  stream: NodeJS.ReadableStream | null,
  buffer: string[],
  label: string
): void {
  if (!stream) {
    return
  }

  stream.setEncoding('utf8')

  let pending = ''
  stream.on('data', (chunk: string) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      appendLogLine(buffer, line)

      if (process.env.E2E_DEBUG) {
        process.stderr.write(`[${label}] ${line}\n`)
      }
    }
  })

  stream.on('end', () => {
    if (!pending) {
      return
    }

    const line = pending.trimEnd()
    appendLogLine(buffer, line)

    if (process.env.E2E_DEBUG) {
      process.stderr.write(`[${label}] ${line}\n`)
    }
  })
}

function formatElectronLogs(): string {
  const sections = [
    ['stdout', electronStdoutLines],
    ['stderr', electronStderrLines]
  ]
    .filter(([, lines]) => lines.length > 0)
    .map(([label, lines]) => `${label}:\n${lines.join('\n')}`)

  return sections.length > 0 ? `\nRecent Electron dev logs:\n${sections.join('\n\n')}` : ''
}

function logStep(message: string): void {
  if (!process.env.E2E_DEBUG) {
    return
  }

  process.stderr.write(`[electron:e2e] ${message}\n`)
}

function ensureElectronRuntimeDeps(): void {
  if (process.env.SKIP_ELECTRON_DEPS_REBUILD === 'true') {
    return
  }

  execSync('pnpm --filter xnet-desktop run deps:electron', {
    cwd: ROOT,
    stdio: process.env.E2E_DEBUG ? 'inherit' : 'pipe'
  })
}

function spawnElectronDev(): ChildProcess {
  electronStdoutLines.length = 0
  electronStderrLines.length = 0

  const proc = spawn(PNPM_BIN, ['exec', 'electron-vite', 'dev'], {
    cwd: `${ROOT}/apps/electron`,
    env: {
      ...process.env,
      ELECTRON_CDP_PORT: String(ELECTRON_CDP_PORT),
      VITE_PORT: String(RENDERER_PORT),
      XNET_PROFILE: ELECTRON_PROFILE,
      XNET_TEST_BYPASS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })

  attachLogCollector(proc.stdout, electronStdoutLines, 'electron:stdout')
  attachLogCollector(proc.stderr, electronStderrLines, 'electron:stderr')

  proc.on('exit', (code, signal) => {
    appendLogLine(
      electronStderrLines,
      `electron-vite exited before test teardown (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
    )
  })

  return proc
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

  throw new Error(
    `Timed out waiting for Electron CDP endpoint on ${ELECTRON_CDP_URL}${formatElectronLogs()}`
  )
}

async function waitForRendererReady(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    for (const url of RENDERER_URLS) {
      try {
        const response = await fetch(url)
        if (response.ok) {
          return
        }
      } catch {
        // try the next host form
      }
    }

    await sleep(500)
  }

  throw new Error(
    `Timed out waiting for Electron renderer dev server on ${RENDERER_URLS.join(', ')}${formatElectronLogs()}`
  )
}

async function waitForElectronPage(browser: Browser, timeoutMs = 60_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages())
    const page = pages.find((candidate) =>
      RENDERER_URLS.some((url) => candidate.url().startsWith(url))
    )

    if (page) {
      await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs })
      return page
    }

    if (process.env.E2E_DEBUG) {
      const urls = pages.map((candidate) => candidate.url() || '<empty>')
      logStep(`waiting for renderer target, saw: ${urls.join(', ') || '<none>'}`)
    }

    await sleep(250)
  }

  throw new Error(`Timed out waiting for the Electron renderer page${formatElectronLogs()}`)
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

async function logShellDebugState(page: Page, label: string): Promise<void> {
  if (!process.env.E2E_DEBUG) {
    return
  }

  const state = await page.evaluate(async () => {
    const store = (
      window as Window & {
        __xnetNodeStore?: {
          list: (params: { limit: number; offset: number }) => Promise<
            Array<{
              id: string
              schemaId: string
              properties: { title?: unknown }
            }>
          >
        }
      }
    ).__xnetNodeStore

    const nodes = store ? await store.list({ limit: 50, offset: 0 }) : []

    return {
      bodyText: document.body.innerText,
      buttonLabels: Array.from(document.querySelectorAll('button')).map((button) =>
        button.textContent?.trim()
      ),
      canvasSurface: (() => {
        const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
        if (!surface) {
          return null
        }

        return {
          nodeCount: surface.dataset.nodeCount ?? null,
          visibleNodeCount: surface.dataset.visibleNodeCount ?? null,
          edgeCount: surface.dataset.edgeCount ?? null,
          visibleEdgeCount: surface.dataset.visibleEdgeCount ?? null,
          viewportX: surface.dataset.viewportX ?? null,
          viewportY: surface.dataset.viewportY ?? null,
          viewportZoom: surface.dataset.viewportZoom ?? null,
          viewportWidth: surface.dataset.viewportWidth ?? null,
          viewportHeight: surface.dataset.viewportHeight ?? null,
          rect: {
            width: surface.getBoundingClientRect().width,
            height: surface.getBoundingClientRect().height
          }
        }
      })(),
      canvasNodes: Array.from(document.querySelectorAll<HTMLElement>('.canvas-node')).map(
        (node) => ({
          id: node.dataset.nodeId ?? null,
          type: node.dataset.nodeType ?? null,
          lod: node.dataset.lod ?? null,
          text: node.innerText,
          left: node.style.left,
          top: node.style.top,
          width: node.style.width,
          height: node.style.height
        })
      ),
      nodes: nodes.map((node) => ({
        id: node.id,
        schemaId: node.schemaId,
        title: typeof node.properties.title === 'string' ? node.properties.title : null
      }))
    }
  })

  logStep(`${label}: ${JSON.stringify(state)}`)
}

async function getContentEditableCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('[contenteditable="true"]').length)
}

test.describe('Electron canvas shell', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(240_000)

  let electronProc: ChildProcess | null = null
  let electronBrowser: Browser | null = null
  let electronPage: Page | null = null

  test.beforeAll(async () => {
    rmSync(ELECTRON_PROFILE_PATH, { recursive: true, force: true })

    logStep('rebuilding Electron native dependencies')
    ensureElectronRuntimeDeps()
    logStep('spawning Electron dev server')
    electronProc = spawnElectronDev()
    logStep('waiting for CDP endpoint')
    await waitForCdpReady()
    logStep('waiting for renderer dev server')
    await waitForRendererReady()
    logStep('connecting Playwright to Electron over CDP')
    electronBrowser = await chromium.connectOverCDP(ELECTRON_CDP_URL)
    logStep('waiting for Electron renderer page')
    electronPage = await waitForElectronPage(electronBrowser)

    if (process.env.E2E_DEBUG) {
      electronPage.on('console', (message) => {
        process.stderr.write(`[electron:console] ${message.type()}: ${message.text()}\n`)
      })
    }

    logStep('advancing onboarding if needed')
    await advanceOnboardingIfNeeded(electronPage)
    logStep('waiting for canvas shell controls')
    await waitForCanvasShell(electronPage)
    logStep('canvas shell ready')
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

    await logShellDebugState(page, 'before-create')
    await page.getByRole('button', { name: 'Page' }).click({ force: true })
    await logShellDebugState(page, 'after-page-click')
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

    await page
      .getByRole('button', { name: /hide minimap/i })
      .evaluate((button: HTMLButtonElement) => button.click())
    await logShellDebugState(page, 'after-hide-minimap')
    await expect(page.getByRole('button', { name: /show minimap/i })).toBeVisible()
    await page
      .getByRole('button', { name: /show minimap/i })
      .evaluate((button: HTMLButtonElement) => button.click())
    await logShellDebugState(page, 'after-show-minimap')
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

  test('mounts a single inline page editor only for the active canvas object', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!

    const firstPageNode = page.locator('.canvas-node[data-node-type="page"]').first()
    await expect(firstPageNode).toBeVisible({ timeout: 30_000 })

    await firstPageNode.click({
      force: true,
      position: { x: 40, y: 80 }
    })
    const pageSurface = page.locator('[data-canvas-page-surface="true"]').first()
    await expect(pageSurface).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => getContentEditableCount(page), {
        timeout: 15_000
      })
      .toBe(1)

    const titleInput = page.locator('[data-canvas-page-title="true"]').first()
    await titleInput.fill('Canvas draft')

    const editor = page.locator('[data-canvas-page-editor="true"] [contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('Canvas body text')
    await expect(pageSurface).toContainText('Canvas body text')

    await page.locator('[data-canvas-surface="true"]').click({
      position: { x: 24, y: 240 },
      force: true
    })
    await expect
      .poll(async () => getContentEditableCount(page), {
        timeout: 15_000
      })
      .toBe(0)
    await expect(page.getByText('Canvas draft')).toBeVisible({ timeout: 30_000 })

    await page
      .locator('.canvas-node[data-node-type="page"]')
      .first()
      .click({
        force: true,
        position: { x: 40, y: 80 }
      })
    await expect(pageSurface).toContainText('Canvas body text', { timeout: 30_000 })
    await expect
      .poll(async () => getContentEditableCount(page), {
        timeout: 15_000
      })
      .toBe(1)

    await page.screenshot({
      path: `${ROOT}/tmp/playwright/electron-canvas-inline-page.png`,
      fullPage: true
    })
  })
})
