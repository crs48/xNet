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
const FOCUSED_OPEN_SHORTCUT = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
const SPLIT_OPEN_SHORTCUT = 'Alt+Enter'
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

function getPerformanceBudget(localBudgetMs: number, ciBudgetMs: number): number {
  return process.env.CI ? ciBudgetMs : localBudgetMs
}

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

async function seedPerformanceScene(
  page: Page,
  input: {
    canvasId?: string
    title?: string
    columns?: number
    rows?: number
    clusterColumns?: number
    clusterRows?: number
  } = {}
): Promise<{
  canvasId: string
  title: string
  nodeCount: number
  edgeCount: number
  bounds: { x: number; y: number; width: number; height: number }
  kindCounts: Record<string, number>
}> {
  return page.evaluate(async (sceneInput) => {
    const harness = (
      window as Window & {
        __xnetCanvasTestHarness?: {
          seedPerformanceScene: (input?: typeof sceneInput) => Promise<{
            canvasId: string
            title: string
            nodeCount: number
            edgeCount: number
            bounds: { x: number; y: number; width: number; height: number }
            kindCounts: Record<string, number>
          }>
        }
      }
    ).__xnetCanvasTestHarness

    if (!harness) {
      throw new Error('Canvas test harness not available')
    }

    return harness.seedPerformanceScene(sceneInput)
  }, input)
}

async function getActiveQueryDiagnostics(page: Page): Promise<
  Array<{
    id: string
    type: string
    schemaId: string
    mode: string
    descriptorKey?: string
    nodeId?: string
    updateCount: number
    resultCount: number
  }>
> {
  return page.evaluate(() => {
    const diagnostics = (
      window as Window & {
        __xnetDevToolsDiagnostics?: {
          getActiveNodeId: () => string | null
          getActiveQueries: () => Array<{
            id: string
            type: string
            schemaId: string
            mode: string
            descriptorKey?: string
            nodeId?: string
            updateCount: number
            resultCount: number
          }>
        }
      }
    ).__xnetDevToolsDiagnostics

    return diagnostics ? diagnostics.getActiveQueries() : []
  })
}

async function getActiveCanvasNodeId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const diagnostics = (
      window as Window & {
        __xnetDevToolsDiagnostics?: {
          getActiveNodeId: () => string | null
        }
      }
    ).__xnetDevToolsDiagnostics

    return diagnostics ? diagnostics.getActiveNodeId() : null
  })
}

async function getCanvasShellMetrics(page: Page): Promise<{
  nodeCount: number
  loadedNodeCount: number
  visibleNodeCount: number
  domNodeCount: number
  overviewNodeCount: number
  renderMode: string
  edgeCount: number
  loadedEdgeCount: number
  visibleEdgeCount: number
  loadedChunkCount: number
  queuedChunkCount: number
  viewportX: number
  viewportY: number
  viewportZoom: number
  canvasNodeElements: number
  canvasElements: number
  contentEditableElements: number
  tableElements: number
  minimapVisible: boolean
  minimapRenderedNodeCount: number
  minimapRenderMode: string
}> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    if (!surface) {
      throw new Error('Canvas surface not found')
    }

    return {
      nodeCount: Number(surface.dataset.nodeCount ?? 0),
      loadedNodeCount: Number(surface.dataset.loadedNodeCount ?? 0),
      visibleNodeCount: Number(surface.dataset.visibleNodeCount ?? 0),
      domNodeCount: Number(surface.dataset.domNodeCount ?? 0),
      overviewNodeCount: Number(surface.dataset.overviewNodeCount ?? 0),
      renderMode: surface.dataset.canvasRenderMode ?? 'dom',
      edgeCount: Number(surface.dataset.edgeCount ?? 0),
      loadedEdgeCount: Number(surface.dataset.loadedEdgeCount ?? 0),
      visibleEdgeCount: Number(surface.dataset.visibleEdgeCount ?? 0),
      loadedChunkCount: Number(surface.dataset.loadedChunkCount ?? 0),
      queuedChunkCount: Number(surface.dataset.queuedChunkCount ?? 0),
      viewportX: Number(surface.dataset.viewportX ?? 0),
      viewportY: Number(surface.dataset.viewportY ?? 0),
      viewportZoom: Number(surface.dataset.viewportZoom ?? 0),
      canvasNodeElements: document.querySelectorAll('.canvas-node').length,
      canvasElements: document.querySelectorAll('canvas').length,
      contentEditableElements: document.querySelectorAll('[contenteditable="true"]').length,
      tableElements: document.querySelectorAll('table').length,
      minimapVisible: document.querySelector('[data-canvas-minimap="true"]') !== null,
      minimapRenderedNodeCount: Number(
        document.querySelector<HTMLElement>('[data-canvas-minimap="true"]')?.dataset
          .canvasMinimapRenderedNodeCount ?? 0
      ),
      minimapRenderMode:
        document.querySelector<HTMLElement>('[data-canvas-minimap="true"]')?.dataset
          .canvasMinimapRenderMode ?? 'full'
    }
  })
}

async function getCanvasThemeDiagnostics(page: Page): Promise<{
  surfaceTheme: string | null
  navigationTheme: string | null
  minimapTheme: string | null
  homeBadgeTheme: string | null
  selectionHudTheme: string | null
  inlinePageTheme: string | null
  databaseTheme: string | null
  peekTheme: string | null
  peekBackdropTheme: string | null
  surfaceBackground: string
  navigationBackground: string
  minimapDismissBackground: string
  homeBadgeBackground: string | null
  selectionHudBackground: string | null
  inlinePageBackground: string | null
  databaseBackground: string | null
  peekBackground: string | null
  peekBackdropBackground: string | null
}> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    const navigationTools = document.querySelector<HTMLElement>('.navigation-tools')
    const minimap = document.querySelector<HTMLElement>('[data-canvas-minimap="true"]')
    const minimapDismissButton = document.querySelector<HTMLElement>(
      '[data-canvas-minimap-toggle="hide"]'
    )

    if (!surface || !navigationTools || !minimap || !minimapDismissButton) {
      throw new Error('Canvas theme diagnostics are not ready')
    }

    const getTheme = (selector: string): string | null =>
      document.querySelector<HTMLElement>(selector)?.dataset.canvasTheme ?? null
    const getBackground = (selector: string): string | null => {
      const element = document.querySelector<HTMLElement>(selector)
      return element ? window.getComputedStyle(element).backgroundColor : null
    }

    return {
      surfaceTheme: surface.dataset.canvasTheme ?? null,
      navigationTheme: navigationTools.dataset.canvasTheme ?? null,
      minimapTheme: minimap.dataset.canvasTheme ?? null,
      homeBadgeTheme: getTheme('[data-canvas-home-badge="true"]'),
      selectionHudTheme: getTheme('[data-canvas-selection-hud="true"]'),
      inlinePageTheme: getTheme('[data-canvas-page-surface="true"]'),
      databaseTheme: getTheme('[data-canvas-database-surface="true"]'),
      peekTheme: getTheme('[data-canvas-peek-surface="true"]'),
      peekBackdropTheme: getTheme('[data-canvas-peek-backdrop="true"]'),
      surfaceBackground: window.getComputedStyle(surface).backgroundColor,
      navigationBackground: window.getComputedStyle(navigationTools).backgroundColor,
      minimapDismissBackground: window.getComputedStyle(minimapDismissButton).backgroundColor,
      homeBadgeBackground: getBackground('[data-canvas-home-badge="true"]'),
      selectionHudBackground: getBackground('[data-canvas-selection-hud="true"]'),
      inlinePageBackground: getBackground('[data-canvas-page-surface="true"]'),
      databaseBackground: getBackground('[data-canvas-database-surface="true"]'),
      peekBackground: getBackground('[data-canvas-peek-surface="true"]'),
      peekBackdropBackground: getBackground('[data-canvas-peek-backdrop="true"]')
    }
  })
}

async function setElectronTheme(page: Page, theme: 'light' | 'dark' | 'system'): Promise<void> {
  const expectedTheme =
    theme === 'system'
      ? await page.evaluate(() =>
          window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        )
      : theme

  await page.evaluate((nextTheme) => {
    localStorage.setItem('xnet-electron-theme', nextTheme)

    const root = document.documentElement
    root.classList.remove('light', 'dark')

    if (nextTheme === 'system') {
      root.classList.add(
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      )
      return
    }

    root.classList.add(nextTheme)
  }, theme)

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      })
    })
    .toBe(expectedTheme)
}

async function measureCanvasFrameBudget(
  page: Page,
  stepCount = 18
): Promise<{ samples: number; averageMs: number; maxMs: number }> {
  return page.evaluate(async (steps) => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    if (!surface) {
      throw new Error('Canvas surface not found')
    }

    const nextFrame = async (): Promise<number> =>
      await new Promise((resolve) => requestAnimationFrame((timestamp) => resolve(timestamp)))

    const samples: number[] = []
    let previous = await nextFrame()

    for (let index = 0; index < steps; index += 1) {
      surface.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaX: index % 2 === 0 ? 140 : -120,
          deltaY: index % 3 === 0 ? 90 : -70
        })
      )

      const current = await nextFrame()
      samples.push(current - previous)
      previous = current
    }

    const total = samples.reduce((sum, value) => sum + value, 0)
    return {
      samples: samples.length,
      averageMs: samples.length > 0 ? total / samples.length : 0,
      maxMs: samples.reduce((max, value) => Math.max(max, value), 0)
    }
  }, stepCount)
}

async function selectCanvasNode(page: Page, selector: string, index = 0): Promise<void> {
  const locator = page.locator(selector).nth(index)
  await expect(locator).toBeVisible({ timeout: 30_000 })
  await locator.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const clientX = rect.left + Math.min(40, rect.width / 2)
    const clientY = rect.top + Math.min(80, rect.height / 2)
    const eventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY
    }

    element.dispatchEvent(new MouseEvent('mousedown', eventInit))
    element.dispatchEvent(new MouseEvent('mouseup', eventInit))
    element.dispatchEvent(new MouseEvent('click', eventInit))
  })
}

async function getCanvasNodeCount(page: Page, type: string): Promise<number> {
  return page.locator(`.canvas-node[data-node-type="${type}"]`).count()
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

  test('adapts canvas chrome across light and dark themes in Electron', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!

    await expect(page.locator('.navigation-tools')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-canvas-minimap="true"]')).toBeVisible({ timeout: 30_000 })

    const darkDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(darkDiagnostics.surfaceTheme).toBe('dark')
    expect(darkDiagnostics.navigationTheme).toBe('dark')
    expect(darkDiagnostics.minimapTheme).toBe('dark')
    expect(darkDiagnostics.homeBadgeTheme).toBe('dark')

    const pageCountBefore = await getCanvasNodeCount(page, 'page')
    await page.getByRole('button', { name: 'Page' }).click({ force: true })
    await expect.poll(async () => await getCanvasNodeCount(page, 'page')).toBe(pageCountBefore + 1)
    await selectCanvasNode(page, '.canvas-node[data-node-type="page"]', pageCountBefore)
    await expect(page.locator('[data-canvas-page-surface="true"]').first()).toBeVisible({
      timeout: 30_000
    })
    await expect(page.locator('[data-canvas-selection-hud="true"]')).toBeVisible({
      timeout: 30_000
    })
    await page.locator('[data-canvas-selection-action="peek"]').first().click()
    await expect(page.locator('[data-canvas-peek-surface="true"]')).toBeVisible({
      timeout: 30_000
    })

    const darkContentDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(darkContentDiagnostics.inlinePageTheme).toBe('dark')
    expect(darkContentDiagnostics.selectionHudTheme).toBe('dark')
    expect(darkContentDiagnostics.peekTheme).toBe('dark')
    expect(darkContentDiagnostics.peekBackdropTheme).toBe('dark')

    await setElectronTheme(page, 'light')

    await expect
      .poll(async () => (await getCanvasThemeDiagnostics(page)).surfaceTheme, { timeout: 30_000 })
      .toBe('light')
    await expect
      .poll(async () => (await getCanvasThemeDiagnostics(page)).peekTheme, { timeout: 30_000 })
      .toBe('light')

    const lightDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(lightDiagnostics.homeBadgeTheme).toBe('light')
    expect(lightDiagnostics.navigationTheme).toBe('light')
    expect(lightDiagnostics.minimapTheme).toBe('light')
    expect(lightDiagnostics.inlinePageTheme).toBe('light')
    expect(lightDiagnostics.selectionHudTheme).toBe('light')
    expect(lightDiagnostics.peekTheme).toBe('light')
    expect(lightDiagnostics.peekBackdropTheme).toBe('light')
    expect(lightDiagnostics.surfaceBackground).not.toBe(darkDiagnostics.surfaceBackground)
    expect(lightDiagnostics.navigationBackground).not.toBe(darkDiagnostics.navigationBackground)
    expect(lightDiagnostics.minimapDismissBackground).not.toBe(
      darkDiagnostics.minimapDismissBackground
    )
    expect(lightDiagnostics.homeBadgeBackground).not.toBe(darkDiagnostics.homeBadgeBackground)
    expect(lightDiagnostics.inlinePageBackground).not.toBe(
      darkContentDiagnostics.inlinePageBackground
    )

    await page.locator('[data-canvas-peek-close="true"]').first().click()
    await expect(page.locator('[data-canvas-peek-surface="true"]')).toHaveCount(0, {
      timeout: 30_000
    })
    const databaseCountBefore = await getCanvasNodeCount(page, 'database')
    await page.getByRole('button', { name: 'Database' }).click({ force: true })
    await expect
      .poll(async () => await getCanvasNodeCount(page, 'database'))
      .toBe(databaseCountBefore + 1)
    await selectCanvasNode(page, '.canvas-node[data-node-type="database"]', databaseCountBefore)
    await expect(page.locator('[data-canvas-database-surface="true"]').first()).toBeVisible({
      timeout: 30_000
    })
    const lightDatabaseDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(lightDatabaseDiagnostics.databaseTheme).toBe('light')

    await setElectronTheme(page, 'dark')

    await expect
      .poll(async () => (await getCanvasThemeDiagnostics(page)).surfaceTheme, { timeout: 30_000 })
      .toBe('dark')
    await expect
      .poll(async () => (await getCanvasThemeDiagnostics(page)).databaseTheme, { timeout: 30_000 })
      .toBe('dark')

    const restoredDarkDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(restoredDarkDiagnostics.databaseTheme).toBe('dark')
    expect(restoredDarkDiagnostics.databaseBackground).not.toBe(
      lightDatabaseDiagnostics.databaseBackground
    )

    await page.screenshot({
      path: 'tmp/playwright/electron-canvas-themes.png',
      fullPage: true
    })
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

    await selectCanvasNode(page, '.canvas-node[data-node-type="page"]')
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
    await editor.focus()
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

    await selectCanvasNode(page, '.canvas-node[data-node-type="page"]')
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

  test('supports centered page peek before full focus transitions', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!

    await selectCanvasNode(page, '.canvas-node[data-node-type="page"]')
    await page.locator('[data-canvas-surface="true"]').focus()
    await page.keyboard.press('Enter')

    const peekSurface = page.locator(
      '[data-canvas-peek-surface="true"][data-canvas-peek-kind="page"]'
    )
    await expect(peekSurface).toBeVisible({ timeout: 30_000 })
    await expect(
      page.locator('[data-canvas-page-surface="true"][data-canvas-page-surface-mode="peek"]')
    ).toHaveCount(1)
    await expect(
      page.locator('[data-canvas-page-surface="true"][data-canvas-page-surface-mode="inline"]')
    ).toHaveCount(0)
    await expect
      .poll(async () => getContentEditableCount(page), {
        timeout: 15_000
      })
      .toBe(1)

    const titleInput = page
      .locator('[data-canvas-peek-surface="true"] [data-canvas-page-title="true"]')
      .first()
    await titleInput.fill('Peek Draft')

    const editor = page.locator(
      '[data-canvas-peek-surface="true"] [data-canvas-page-editor="true"] [contenteditable="true"]'
    )
    await editor.focus()
    await page.keyboard.type('Peek body text')
    await expect(peekSurface).toContainText('Peek body text')

    await page.keyboard.press('Escape')
    await expect(peekSurface).toHaveCount(0, { timeout: 15_000 })
    await expect(
      page.locator('[data-canvas-page-surface="true"][data-canvas-page-surface-mode="inline"]')
    ).toHaveCount(1, {
      timeout: 30_000
    })

    await page.locator('[data-canvas-surface="true"]').focus()
    await page.keyboard.press('Enter')
    await expect(peekSurface).toBeVisible({ timeout: 30_000 })
    await page
      .locator('[data-canvas-peek-surface="true"] [data-canvas-page-open="true"]')
      .first()
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(
      page.locator('[data-page-view="true"][data-page-view-chrome="minimal"]')
    ).toBeVisible({
      timeout: 30_000
    })

    await page.getByRole('button', { name: 'Canvas' }).click({ force: true })
    await expect(peekSurface).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByText('Peek Draft')).toBeVisible({ timeout: 30_000 })

    await page.screenshot({
      path: `${ROOT}/tmp/playwright/electron-canvas-page-peek.png`,
      fullPage: true
    })
  })

  test('supports canvas-scoped hotkeys, command commands, and typing guards', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!

    await page.locator('[data-canvas-surface="true"]').click({
      position: { x: 28, y: 260 },
      force: true
    })

    await page.keyboard.press('Shift+/')
    await expect(page.locator('[data-canvas-shortcut-help="true"]')).toBeVisible({
      timeout: 15_000
    })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-canvas-shortcut-help="true"]')).toHaveCount(0)

    await page.keyboard.press('Tab')
    await expect(page.locator('[data-canvas-selection-hud="true"]')).toBeVisible({
      timeout: 15_000
    })

    await page.keyboard.press(COMMAND_PALETTE_SHORTCUT)
    const commandInput = page.getByPlaceholder('Type a command or search...')
    await expect(commandInput).toBeVisible({ timeout: 10_000 })
    await commandInput.fill('Show Canvas Shortcuts')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-canvas-shortcut-help="true"]')).toBeVisible({
      timeout: 15_000
    })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-canvas-shortcut-help="true"]')).toHaveCount(0)

    const pageCountBefore = await getCanvasNodeCount(page, 'page')
    const databaseCountBefore = await getCanvasNodeCount(page, 'database')
    const noteCountBefore = await getCanvasNodeCount(page, 'note')

    const canvasSurface = page.locator('[data-canvas-surface="true"]')

    await canvasSurface.click({
      position: { x: 36, y: 320 },
      force: true
    })
    await page.keyboard.press('P')
    await canvasSurface.focus()
    await page.keyboard.press('D')
    await canvasSurface.focus()
    await page.keyboard.press('N')

    await expect
      .poll(async () => ({
        page: await getCanvasNodeCount(page, 'page'),
        database: await getCanvasNodeCount(page, 'database'),
        note: await getCanvasNodeCount(page, 'note')
      }))
      .toEqual({
        page: pageCountBefore + 1,
        database: databaseCountBefore + 1,
        note: noteCountBefore + 1
      })

    const newestPageIndex = (await getCanvasNodeCount(page, 'page')) - 1
    await selectCanvasNode(page, '.canvas-node[data-node-type="page"]', newestPageIndex)
    await expect(page.locator('[data-canvas-page-surface="true"]').first()).toBeVisible({
      timeout: 30_000
    })

    await page.keyboard.press(FOCUSED_OPEN_SHORTCUT)
    await expect(
      page.locator('[data-page-view="true"][data-page-view-chrome="minimal"]')
    ).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('button', { name: 'Canvas' }).click({ force: true })
    await expect(
      page.locator('[data-page-view="true"][data-page-view-chrome="minimal"]')
    ).toHaveCount(0, {
      timeout: 30_000
    })

    await selectCanvasNode(page, '.canvas-node[data-node-type="page"]', newestPageIndex)
    const titleInput = page.locator('[data-canvas-page-title="true"]').first()
    await titleInput.focus()
    await page.keyboard.type('p')
    await page.keyboard.press('Shift+/')

    await expect.poll(async () => await getCanvasNodeCount(page, 'page')).toBe(pageCountBefore + 1)
    await expect(page.locator('[data-canvas-shortcut-help="true"]')).toHaveCount(0)
  })

  test('keeps database preview bounded and supports open-return workflows', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!

    await selectCanvasNode(page, '.canvas-node[data-node-type="database"]')
    const databaseSurface = page.locator('[data-canvas-database-surface="true"]').first()
    await expect(databaseSurface).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-canvas-page-surface="true"]')).toHaveCount(0)
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            contentEditableElements: document.querySelectorAll('[contenteditable="true"]').length,
            tableElements: document.querySelectorAll('table').length
          })),
        {
          timeout: 15_000
        }
      )
      .toEqual({
        contentEditableElements: 0,
        tableElements: 0
      })

    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            startTable: document.querySelectorAll('[data-canvas-database-start-table="true"]')
              .length,
            open: document.querySelectorAll('[data-canvas-database-open="true"]').length
          })),
        {
          timeout: 30_000
        }
      )
      .not.toEqual({
        startTable: 0,
        open: 0
      })

    const startTableButton = page.locator('[data-canvas-database-start-table="true"]').first()
    if ((await startTableButton.count()) > 0 && (await startTableButton.isVisible())) {
      await startTableButton.evaluate((button: HTMLButtonElement) => button.click())
      await expect(databaseSurface).toHaveAttribute('data-canvas-database-empty', 'false', {
        timeout: 30_000
      })
    }

    const splitButton = page.locator('[data-canvas-database-split="true"]').first()
    await expect(splitButton).toBeVisible({ timeout: 30_000 })
    await splitButton.evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.locator('[data-database-split-panel="true"]')).toBeVisible({
      timeout: 30_000
    })
    await expect(page.locator('[data-canvas-surface="true"]')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Close split' }).click({ force: true })
    await expect(page.locator('[data-database-split-panel="true"]')).toHaveCount(0, {
      timeout: 30_000
    })
    await expect(databaseSurface).toBeVisible({ timeout: 30_000 })

    await page.locator('[data-canvas-surface="true"]').focus()
    await page.keyboard.press(SPLIT_OPEN_SHORTCUT)
    await expect(page.locator('[data-database-split-panel="true"]')).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('button', { name: 'Close split' }).click({ force: true })
    await expect(page.locator('[data-database-split-panel="true"]')).toHaveCount(0, {
      timeout: 30_000
    })

    await page
      .locator('[data-canvas-database-open="true"]')
      .first()
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(
      page.locator('[data-database-view="true"][data-database-view-chrome="minimal"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Canvas' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Canvas' }).click({ force: true })
    await expect(
      page.locator('[data-database-view="true"][data-database-view-chrome="minimal"]')
    ).toHaveCount(0, {
      timeout: 30_000
    })
    await expect(databaseSurface).toBeVisible({ timeout: 30_000 })

    await page.screenshot({
      path: `${ROOT}/tmp/playwright/electron-canvas-database-preview.png`,
      fullPage: true
    })
  })

  test('keeps dense seeded scenes virtualized while minimap and query metrics stay stable', async () => {
    test.skip(!electronPage, 'Electron page did not initialize')
    const page = electronPage!
    await expect
      .poll(async () => getActiveCanvasNodeId(page), {
        timeout: 15_000
      })
      .not.toBeNull()
    const activeCanvasId = await getActiveCanvasNodeId(page)

    const seededScene = await seedPerformanceScene(page, {
      canvasId: activeCanvasId ?? undefined,
      title: 'Canvas Performance Validation',
      columns: 48,
      rows: 36,
      clusterColumns: 6,
      clusterRows: 4
    })

    await expect
      .poll(async () => (await getCanvasShellMetrics(page)).nodeCount, {
        timeout: 30_000
      })
      .toBe(seededScene.nodeCount)

    await logShellDebugState(page, 'after-seed-performance-scene')

    await page
      .getByRole('button', { name: /hide minimap/i })
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.locator('[data-canvas-minimap="true"]')).toHaveCount(0)
    await page
      .getByRole('button', { name: /show minimap/i })
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.locator('[data-canvas-minimap="true"]')).toHaveCount(1, {
      timeout: 15_000
    })

    const initialMetrics = await getCanvasShellMetrics(page)
    const initialQueries = await getActiveQueryDiagnostics(page)

    expect(initialMetrics.visibleNodeCount).toBeGreaterThan(0)
    expect(initialMetrics.visibleNodeCount).toBeLessThan(getPerformanceBudget(120, 180))
    expect(['dom', 'hybrid']).toContain(initialMetrics.renderMode)
    expect(initialMetrics.domNodeCount).toBeLessThanOrEqual(initialMetrics.visibleNodeCount)
    expect(initialMetrics.domNodeCount).toBeLessThanOrEqual(48)
    expect(initialMetrics.canvasNodeElements).toBe(initialMetrics.domNodeCount)
    expect(initialMetrics.edgeCount).toBe(seededScene.edgeCount)
    expect(initialMetrics.visibleEdgeCount).toBeLessThanOrEqual(initialMetrics.edgeCount)
    expect(initialMetrics.canvasElements).toBeGreaterThanOrEqual(2)
    expect(initialMetrics.contentEditableElements).toBe(0)
    expect(initialMetrics.tableElements).toBe(0)
    expect(initialMetrics.minimapVisible).toBe(true)
    expect(initialMetrics.minimapRenderMode).toBe('aggregated')
    expect(initialMetrics.minimapRenderedNodeCount).toBeLessThan(initialMetrics.nodeCount)
    expect(initialQueries.length).toBeLessThanOrEqual(5)
    if (initialMetrics.renderMode === 'hybrid') {
      expect(initialMetrics.overviewNodeCount).toBeGreaterThan(0)
    } else {
      expect(initialMetrics.overviewNodeCount).toBe(0)
      expect(initialMetrics.domNodeCount).toBe(initialMetrics.visibleNodeCount)
    }

    const initialQueryIds = [...initialQueries].map((query) => query.id).sort()
    const initialViewport = {
      x: initialMetrics.viewportX,
      y: initialMetrics.viewportY
    }

    await page
      .locator('[data-canvas-minimap-canvas="true"]')
      .evaluate((canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect()
        const eventInit = {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: rect.left + rect.width - 12,
          clientY: rect.top + rect.height - 12
        }

        canvas.dispatchEvent(new MouseEvent('mousedown', eventInit))
        canvas.dispatchEvent(new MouseEvent('mouseup', eventInit))
      })

    await expect
      .poll(async () => {
        const metrics = await getCanvasShellMetrics(page)
        return `${metrics.viewportX}:${metrics.viewportY}`
      })
      .not.toBe(`${initialViewport.x}:${initialViewport.y}`)

    const postMinimapMetrics = await getCanvasShellMetrics(page)
    const postMinimapQueryIds = [...(await getActiveQueryDiagnostics(page))]
      .map((query) => query.id)
      .sort()

    expect(postMinimapMetrics.visibleNodeCount).toBeLessThan(getPerformanceBudget(120, 180))
    expect(['dom', 'hybrid']).toContain(postMinimapMetrics.renderMode)
    expect(postMinimapMetrics.domNodeCount).toBeLessThanOrEqual(postMinimapMetrics.visibleNodeCount)
    expect(postMinimapMetrics.domNodeCount).toBeLessThanOrEqual(48)
    expect(postMinimapMetrics.canvasNodeElements).toBe(postMinimapMetrics.domNodeCount)
    expect(postMinimapMetrics.minimapRenderedNodeCount).toBeLessThan(postMinimapMetrics.nodeCount)
    if (postMinimapMetrics.renderMode === 'hybrid') {
      expect(postMinimapMetrics.overviewNodeCount).toBeGreaterThan(0)
    } else {
      expect(postMinimapMetrics.overviewNodeCount).toBe(0)
      expect(postMinimapMetrics.domNodeCount).toBe(postMinimapMetrics.visibleNodeCount)
    }
    expect(postMinimapQueryIds).toEqual(initialQueryIds)

    const frameBudget = await measureCanvasFrameBudget(page, 18)

    expect(frameBudget.samples).toBe(18)
    expect(frameBudget.averageMs).toBeLessThan(getPerformanceBudget(24, 40))
    expect(frameBudget.maxMs).toBeLessThan(getPerformanceBudget(50, 80))

    await page.screenshot({
      path: `${ROOT}/tmp/playwright/electron-canvas-performance-scene.png`,
      fullPage: true
    })
  })
})
