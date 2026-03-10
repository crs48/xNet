import { expect, test } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

const FRAME_SELECTION_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+F' : 'Control+Shift+F'
const ALIAS_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+A' : 'Control+Shift+A'
const COMMENT_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+C' : 'Control+Shift+C'

function getPerformanceBudget(localBudgetMs: number, ciBudgetMs: number): number {
  return process.env.CI ? ciBudgetMs : localBudgetMs
}

async function advanceOnboarding(page: import('@playwright/test').Page): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    const start = page.getByRole('button', { name: /get started with/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(750)
      continue
    }

    const ready = page.getByRole('button', { name: /create your first page/i })
    if ((await ready.count()) > 0 && (await ready.first().isVisible())) {
      await ready.first().click()
      await page.waitForTimeout(750)
      continue
    }

    break
  }
}

async function createCanvas(page: import('@playwright/test').Page): Promise<string> {
  await expect(page.getByRole('heading', { name: /all documents/i })).toBeVisible({
    timeout: 30_000
  })

  const main = page.getByRole('main')
  await main.getByRole('button', { name: /^New$/i }).click()
  await main.getByRole('button', { name: /^Canvas$/ }).click()

  await page.waitForURL(/\/canvas\//, { timeout: 30_000 })

  await dismissStorageWarning(page)

  const match = page.url().match(/\/canvas\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Unable to resolve canvas id from ${page.url()}`)
  }

  return match[1]
}

async function dismissStorageWarning(page: import('@playwright/test').Page): Promise<void> {
  const dismissButton = page.locator('button[aria-label="Dismiss"]').first()
  if ((await dismissButton.count()) === 0 || !(await dismissButton.isVisible())) {
    return
  }

  await dismissButton.click()
  await expect(dismissButton).toBeHidden({ timeout: 30_000 })
}

async function createCanvasNote(page: import('@playwright/test').Page): Promise<number> {
  await dismissStorageWarning(page)

  const noteLocator = page.locator('.canvas-node[data-node-type="note"]')
  const noteCountBefore = await noteLocator.count()
  const targetCount = noteCountBefore + 1
  const surface = page.locator('[data-canvas-surface="true"]')
  await expect(surface).toBeVisible({ timeout: 30_000 })
  await surface.click({
    position: { x: 180, y: 220 },
    force: true
  })
  await surface.focus()
  await page.keyboard.press('N')

  try {
    await expect.poll(async () => await noteLocator.count(), { timeout: 2_500 }).toBe(targetCount)
  } catch {
    await dismissStorageWarning(page)
    await page
      .locator('[data-web-canvas-create-note="true"]')
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(noteLocator).toHaveCount(targetCount, {
      timeout: 30_000
    })
  }

  return noteCountBefore
}

async function seedPerformanceScene(
  page: import('@playwright/test').Page,
  input: {
    canvasId: string
    title?: string
    columns?: number
    rows?: number
    clusterColumns?: number
    clusterRows?: number
  }
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
          seedPerformanceScene: (input: typeof sceneInput) => Promise<{
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

async function measureCanvasFrameBudget(
  page: import('@playwright/test').Page,
  input: {
    canvasId?: string
    steps?: number
    deltaX?: number
    deltaY?: number
  } = {}
): Promise<{
  frameCount: number
  averageFrameTime: number
  maxFrameTime: number
  minFrameTime: number
  droppedFrames: number
  droppedFramePercent: number
  fps: number
}> {
  return page.evaluate(async (budgetInput) => {
    const harness = (
      window as Window & {
        __xnetCanvasTestHarness?: {
          measureCanvasFrameBudget: (input?: typeof budgetInput) => Promise<{
            frameCount: number
            averageFrameTime: number
            maxFrameTime: number
            minFrameTime: number
            droppedFrames: number
            droppedFramePercent: number
            fps: number
          }>
        }
      }
    ).__xnetCanvasTestHarness

    if (!harness) {
      throw new Error('Canvas test harness not available')
    }

    return harness.measureCanvasFrameBudget(budgetInput)
  }, input)
}

async function moveCanvasNode(
  page: import('@playwright/test').Page,
  nodeId: string,
  dx: number,
  dy: number
): Promise<void> {
  await page.evaluate(
    async (input) => {
      const harness = (
        window as Window & {
          __xnetCanvasTestHarness?: {
            moveCanvasNode: (input: typeof input) => Promise<void>
          }
        }
      ).__xnetCanvasTestHarness

      if (!harness) {
        throw new Error('Canvas test harness not available')
      }

      await harness.moveCanvasNode(input)
    },
    { nodeId, dx, dy }
  )
}

async function getCanvasNodeRect(
  page: import('@playwright/test').Page,
  nodeId: string
): Promise<{
  canvasId: string
  x: number
  y: number
  width: number
  height: number
}> {
  return page.evaluate(
    async (input) => {
      const harness = (
        window as Window & {
          __xnetCanvasTestHarness?: {
            getCanvasNodeRect: (input: typeof input) => Promise<{
              canvasId: string
              x: number
              y: number
              width: number
              height: number
            }>
          }
        }
      ).__xnetCanvasTestHarness

      if (!harness) {
        throw new Error('Canvas test harness not available')
      }

      return harness.getCanvasNodeRect(input)
    },
    { nodeId }
  )
}

async function removeCanvasNode(
  page: import('@playwright/test').Page,
  nodeId: string
): Promise<void> {
  await page.evaluate(
    async (input) => {
      const harness = (
        window as Window & {
          __xnetCanvasTestHarness?: {
            removeCanvasNode: (input: typeof input) => Promise<void>
          }
        }
      ).__xnetCanvasTestHarness

      if (!harness) {
        throw new Error('Canvas test harness not available')
      }

      await harness.removeCanvasNode(input)
    },
    { nodeId }
  )
}

async function setCanvasRemotePresence(
  page: import('@playwright/test').Page,
  input: {
    canvasId?: string
    key: string
    state: Record<string, unknown> | null
  }
): Promise<{ canvasId: string; clientId: number }> {
  return page.evaluate(async (presenceInput) => {
    const harness = (
      window as Window & {
        __xnetCanvasTestHarness?: {
          setCanvasRemotePresence: (input: typeof presenceInput) => Promise<{
            canvasId: string
            clientId: number
          }>
        }
      }
    ).__xnetCanvasTestHarness

    if (!harness) {
      throw new Error('Canvas test harness not available')
    }

    return harness.setCanvasRemotePresence(presenceInput)
  }, input)
}

async function waitForCanvasDocument(
  page: import('@playwright/test').Page,
  canvasId: string
): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(async (targetCanvasId) => {
          const store = (
            window as Window & {
              __xnetNodeStore?: {
                get: (id: string) => Promise<unknown>
              }
            }
          ).__xnetNodeStore

          if (!store) {
            return false
          }

          return (await store.get(targetCanvasId)) !== null
        }, canvasId),
      { timeout: 30_000 }
    )
    .toBe(true)
}

async function getCanvasMetrics(page: import('@playwright/test').Page): Promise<{
  nodeCount: number
  visibleNodeCount: number
  visibleEdgeCount: number
  domNodeCount: number
  overviewNodeCount: number
  renderMode: string
  edgeRenderMode: string
  edgeCanvasCount: number
  edgeSvgCount: number
  viewportX: number
  viewportY: number
  canvasNodeElements: number
  contentEditableElements: number
  tableElements: number
  minimapRenderedNodeCount: number
  minimapRenderMode: string
  performanceEnabled: boolean
  frameCount: number
  frameAverageMs: number
  frameMaxMs: number
  frameDroppedFrames: number
  frameDroppedPercent: number
  frameFps: number
}> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    if (!surface) {
      throw new Error('Canvas surface not found')
    }

    const minimap = document.querySelector<HTMLElement>('[data-canvas-minimap="true"]')

    return {
      nodeCount: Number(surface.dataset.nodeCount ?? 0),
      visibleNodeCount: Number(surface.dataset.visibleNodeCount ?? 0),
      visibleEdgeCount: Number(surface.dataset.visibleEdgeCount ?? 0),
      domNodeCount: Number(surface.dataset.domNodeCount ?? 0),
      overviewNodeCount: Number(surface.dataset.overviewNodeCount ?? 0),
      renderMode: surface.dataset.canvasRenderMode ?? 'dom',
      edgeRenderMode: surface.dataset.canvasEdgeRenderMode ?? 'svg',
      edgeCanvasCount: Number(surface.dataset.canvasEdgeCanvasCount ?? 0),
      edgeSvgCount: Number(surface.dataset.canvasEdgeSvgCount ?? 0),
      viewportX: Number(surface.dataset.viewportX ?? 0),
      viewportY: Number(surface.dataset.viewportY ?? 0),
      canvasNodeElements: document.querySelectorAll('.canvas-node').length,
      contentEditableElements: document.querySelectorAll('[contenteditable="true"]').length,
      tableElements: document.querySelectorAll('table').length,
      minimapRenderedNodeCount: Number(minimap?.dataset.canvasMinimapRenderedNodeCount ?? 0),
      minimapRenderMode: minimap?.dataset.canvasMinimapRenderMode ?? 'full',
      performanceEnabled: (surface.dataset.canvasPerformanceEnabled ?? 'false') === 'true',
      frameCount: Number(surface.dataset.canvasFrameCount ?? 0),
      frameAverageMs: Number(surface.dataset.canvasFrameAverageMs ?? 0),
      frameMaxMs: Number(surface.dataset.canvasFrameMaxMs ?? 0),
      frameDroppedFrames: Number(surface.dataset.canvasFrameDropped ?? 0),
      frameDroppedPercent: Number(surface.dataset.canvasFrameDroppedPercent ?? 0),
      frameFps: Number(surface.dataset.canvasFrameFps ?? 0)
    }
  })
}

async function getCanvasThemeDiagnostics(page: import('@playwright/test').Page): Promise<{
  surfaceTheme: string | null
  navigationTheme: string | null
  minimapTheme: string | null
  hintTheme: string | null
  emptyStateTheme: string | null
  firstCardTheme: string | null
  surfaceBackground: string
  navigationBackground: string
  minimapDismissBackground: string
  hintBackground: string | null
  emptyStateBackground: string | null
  firstCardBackground: string | null
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
      hintTheme: getTheme('[data-web-canvas-hint="true"]'),
      emptyStateTheme: getTheme('[data-web-canvas-empty-state="true"]'),
      firstCardTheme: getTheme('[data-canvas-node-card="true"]'),
      surfaceBackground: window.getComputedStyle(surface).backgroundColor,
      navigationBackground: window.getComputedStyle(navigationTools).backgroundColor,
      minimapDismissBackground: window.getComputedStyle(minimapDismissButton).backgroundColor,
      hintBackground: getBackground('[data-web-canvas-hint="true"]'),
      emptyStateBackground: getBackground('[data-web-canvas-empty-state="true"]'),
      firstCardBackground: getBackground('[data-canvas-node-card="true"]')
    }
  })
}

async function selectCanvasNode(
  page: import('@playwright/test').Page,
  selector: string,
  index = 0,
  additive = false
): Promise<void> {
  const locator = page.locator(selector).nth(index)
  await expect(locator).toBeVisible({ timeout: 30_000 })
  await locator.evaluate(
    (element: HTMLElement, eventOptions: { additive: boolean }) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + Math.min(40, rect.width / 2)
      const clientY = rect.top + Math.min(80, rect.height / 2)
      const eventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
        shiftKey: eventOptions.additive
      }

      element.dispatchEvent(new MouseEvent('mousedown', eventInit))
      element.dispatchEvent(new MouseEvent('mouseup', eventInit))
      element.dispatchEvent(new MouseEvent('click', eventInit))
    },
    { additive }
  )
}

async function dragCanvasResizeHandle(
  page: import('@playwright/test').Page,
  selector: string,
  index: number,
  input: {
    handle:
      | 'bottom-right'
      | 'bottom'
      | 'right'
      | 'left'
      | 'top'
      | 'top-left'
      | 'top-right'
      | 'bottom-left'
    dx: number
    dy: number
  }
): Promise<void> {
  const locator = page
    .locator(selector)
    .nth(index)
    .locator(`[data-canvas-resize-handle="${input.handle}"]`)
  await expect(locator).toBeVisible({ timeout: 30_000 })
  const box = await locator.boundingBox()
  if (!box) {
    throw new Error('Resize handle bounding box is unavailable')
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + input.dx, box.y + box.height / 2 + input.dy)
}

async function releaseCanvasPointer(page: import('@playwright/test').Page): Promise<void> {
  await page.mouse.up()
}

async function dragCanvasNode(
  page: import('@playwright/test').Page,
  selector: string,
  index: number,
  dx: number,
  dy: number
): Promise<void> {
  const locator = page.locator(selector).nth(index)
  await expect(locator).toBeVisible({ timeout: 30_000 })

  const box = await locator.boundingBox()
  if (!box) {
    throw new Error('Canvas node bounding box is unavailable')
  }

  const startX = box.x + 12
  const startY = box.y + 12

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy)
  await page.mouse.up()
}

async function marqueeSelectCanvasNodes(
  page: import('@playwright/test').Page,
  selector: string,
  indices: number[]
): Promise<void> {
  const boxes = await Promise.all(
    indices.map(async (index) => {
      const locator = page.locator(selector).nth(index)
      await expect(locator).toBeVisible({ timeout: 30_000 })
      return locator.boundingBox()
    })
  )
  const resolvedBoxes = boxes.filter((box): box is NonNullable<typeof box> => box !== null)
  if (resolvedBoxes.length !== indices.length) {
    throw new Error('Unable to resolve marquee selection bounds')
  }

  const bounds = resolvedBoxes.reduce(
    (accumulator, box) => ({
      left: Math.min(accumulator.left, box.x),
      top: Math.min(accumulator.top, box.y),
      right: Math.max(accumulator.right, box.x + box.width),
      bottom: Math.max(accumulator.bottom, box.y + box.height)
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  )

  await page.keyboard.down('Shift')
  await page.mouse.move(Math.max(12, bounds.left - 18), Math.max(12, bounds.top - 18))
  await page.mouse.down()
  await page.mouse.move(bounds.right + 18, bounds.bottom + 18, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
}

test.describe('Web canvas ingestion', () => {
  test('adapts canvas chrome across light and dark themes on the web', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('xnet-web-theme', 'light')
    })

    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.navigation-tools')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-canvas-minimap="true"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-web-canvas-empty-state="true"]')).toBeVisible({
      timeout: 30_000
    })

    const lightDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(lightDiagnostics.surfaceTheme).toBe('light')
    expect(lightDiagnostics.navigationTheme).toBe('light')
    expect(lightDiagnostics.minimapTheme).toBe('light')
    expect(lightDiagnostics.hintTheme).toBe('light')
    expect(lightDiagnostics.emptyStateTheme).toBe('light')

    await createCanvasNote(page)
    await expect(page.locator('[data-canvas-node-card="true"]').first()).toBeVisible({
      timeout: 30_000
    })
    const lightCardDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(lightCardDiagnostics.firstCardTheme).toBe('light')

    await page.evaluate(() => {
      localStorage.setItem('xnet-web-theme', 'dark')
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    })

    await expect
      .poll(async () => (await getCanvasThemeDiagnostics(page)).surfaceTheme, { timeout: 30_000 })
      .toBe('dark')

    const darkDiagnostics = await getCanvasThemeDiagnostics(page)
    expect(darkDiagnostics.navigationTheme).toBe('dark')
    expect(darkDiagnostics.minimapTheme).toBe('dark')
    expect(darkDiagnostics.hintTheme).toBe('dark')
    expect(darkDiagnostics.firstCardTheme).toBe('dark')
    expect(darkDiagnostics.surfaceBackground).not.toBe(lightDiagnostics.surfaceBackground)
    expect(darkDiagnostics.navigationBackground).not.toBe(lightDiagnostics.navigationBackground)
    expect(darkDiagnostics.minimapDismissBackground).not.toBe(
      lightDiagnostics.minimapDismissBackground
    )
    expect(darkDiagnostics.firstCardBackground).not.toBe(lightCardDiagnostics.firstCardBackground)

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-themes.png',
      fullPage: true
    })
  })

  test('creates source-backed URL and media objects from drops', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-canvas-overview-layer="true"]')).toHaveCount(1)
    await expect(page.locator('[data-canvas-minimap="true"]')).toHaveCount(1)

    const urlTransfer = await page.evaluateHandle(() => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', 'https://github.com/openai/openai/issues/123')
      dataTransfer.setData('text/uri-list', 'https://github.com/openai/openai/issues/123')
      return dataTransfer
    })

    await surface.dispatchEvent('drop', {
      dataTransfer: urlTransfer,
      clientX: 360,
      clientY: 260
    })

    const externalReferenceNode = page.locator('.canvas-node[data-node-type="external-reference"]')
    await expect(externalReferenceNode).toHaveCount(1, { timeout: 30_000 })
    await expect(externalReferenceNode.first()).toContainText('openai#123', { timeout: 30_000 })

    const imageTransfer = await page.evaluateHandle(() => {
      const dataTransfer = new DataTransfer()
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">',
        '<rect width="320" height="180" fill="#e2e8f0" />',
        '<text x="24" y="96" font-size="32" fill="#0f172a">Canvas Drop</text>',
        '</svg>'
      ].join('')
      const file = new File([svg], 'canvas-drop.svg', { type: 'image/svg+xml' })
      dataTransfer.items.add(file)
      return dataTransfer
    })

    await surface.dispatchEvent('drop', {
      dataTransfer: imageTransfer,
      clientX: 540,
      clientY: 340
    })

    const mediaNode = page.locator('.canvas-node[data-node-type="media"]')
    await expect(mediaNode).toHaveCount(1, { timeout: 30_000 })
    await expect(mediaNode.first()).toContainText('canvas-drop.svg', { timeout: 30_000 })
    await expect(surface).toHaveAttribute('data-canvas-render-mode', 'dom')
    await expect(page.locator('[data-canvas-minimap="true"]')).toHaveAttribute(
      'data-canvas-minimap-render-mode',
      'full'
    )

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-ingestion.png',
      fullPage: true
    })
  })

  test('creates native rectangle and frame objects from canvas shortcuts on the web', async ({
    page
  }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    await surface.click({
      position: { x: 180, y: 220 },
      force: true
    })

    await page.keyboard.press('R')
    await expect(page.locator('.canvas-node[data-node-type="shape"]')).toHaveCount(1, {
      timeout: 30_000
    })
    await expect(
      page.locator('[data-canvas-primitive-node="true"][data-canvas-primitive-kind="shape"]')
    ).toHaveCount(1)

    await page.keyboard.press('F')
    await expect(page.locator('.canvas-node[data-node-type="group"]')).toHaveCount(1, {
      timeout: 30_000
    })
    await expect(
      page.locator('[data-canvas-primitive-node="true"][data-canvas-container-role="frame"]')
    ).toHaveCount(1)

    await page.keyboard.press('R')
    await expect(page.locator('.canvas-node[data-node-type="shape"]')).toHaveCount(2, {
      timeout: 30_000
    })

    await selectCanvasNode(page, '.canvas-node[data-node-type="shape"]', 0)
    await selectCanvasNode(page, '.canvas-node[data-node-type="shape"]', 1, true)
    await page.keyboard.press(FRAME_SELECTION_SHORTCUT)
    await expect(page.locator('.canvas-node[data-node-type="group"]')).toHaveCount(2, {
      timeout: 30_000
    })

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-primitives.png',
      fullPage: true
    })
  })

  test('supports spatial keyboard focus and announcements on the web canvas', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    await surface.click({
      position: { x: 180, y: 220 },
      force: true
    })

    await page.keyboard.press('R')
    await page.keyboard.press('R')

    const shapes = page.locator('.canvas-node[data-node-type="shape"]')
    await expect(shapes).toHaveCount(2, { timeout: 30_000 })

    await surface.focus()
    await page.keyboard.press('Home')

    await expect
      .poll(async () => await surface.getAttribute('data-canvas-focused-node-id'), {
        timeout: 30_000
      })
      .not.toBe('')

    const firstFocusedNodeId = await surface.getAttribute('data-canvas-focused-node-id')
    expect(firstFocusedNodeId).toBeTruthy()

    await expect
      .poll(async () => await surface.getAttribute('data-canvas-last-announcement'), {
        timeout: 30_000
      })
      .toContain('Shape: Rectangle')

    await page.keyboard.press('End')

    await expect
      .poll(async () => await surface.getAttribute('data-canvas-focused-node-id'), {
        timeout: 30_000
      })
      .not.toBe(firstFocusedNodeId)

    const focusedNodeId = await surface.getAttribute('data-canvas-focused-node-id')
    expect(focusedNodeId).toBeTruthy()
    await expect(page.locator(`.canvas-node[data-node-id="${focusedNodeId}"]`)).toHaveAttribute(
      'data-focused',
      'true'
    )
    await expect(surface).toHaveAttribute('data-canvas-last-announcement', /Shape: Rectangle/)

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-keyboard-focus.png',
      fullPage: true
    })
  })

  test('supports marquee multi-selection on the web canvas', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    await surface.click({
      position: { x: 180, y: 220 },
      force: true
    })

    await page.keyboard.press('R')
    await page.keyboard.press('R')
    await page.keyboard.press('R')

    const shapes = page.locator('.canvas-node[data-node-type="shape"]')
    await expect(shapes).toHaveCount(3, { timeout: 30_000 })

    await dragCanvasNode(page, '.canvas-node[data-node-type="shape"]', 2, 320, 180)
    await surface.click({
      position: { x: 40, y: 40 },
      force: true
    })
    await expect(surface).toHaveAttribute('data-selection-count', '0')

    await marqueeSelectCanvasNodes(page, '.canvas-node[data-node-type="shape"]', [0, 1])

    await expect(surface).toHaveAttribute('data-selection-count', '2')
    await expect(surface).toHaveAttribute('data-canvas-marquee-active', 'false')

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-marquee-selection.png',
      fullPage: true
    })
  })

  test('renames a source-backed object with a canvas-local alias on the web', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    const noteCountBefore = await createCanvasNote(page)

    await selectCanvasNode(page, '.canvas-node[data-node-type="note"]', noteCountBefore)
    await surface.focus()
    await page.keyboard.press(ALIAS_SHORTCUT)

    const aliasEditor = page.locator('[data-web-canvas-alias-editor="true"]')
    await expect(aliasEditor).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-web-canvas-alias-input="true"]').fill('Quick Alias')
    await page.keyboard.press('Enter')

    await expect(page.locator('[data-web-canvas-selection-pill="true"]')).toContainText(
      'Quick Alias',
      {
        timeout: 30_000
      }
    )
    await expect(page.locator('[data-canvas-node-card="true"]').last()).toContainText(
      'Quick Alias',
      {
        timeout: 30_000
      }
    )

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-aliases.png',
      fullPage: true
    })
  })

  test('anchors canvas comments to objects and keeps orphaned threads reachable on the web', async ({
    page
  }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    const noteCountBefore = await createCanvasNote(page)

    await selectCanvasNode(page, '.canvas-node[data-node-type="note"]', noteCountBefore)
    const noteNode = page.locator('.canvas-node[data-node-type="note"]').nth(noteCountBefore)
    const noteNodeId = await noteNode.getAttribute('data-node-id')
    if (!noteNodeId) {
      throw new Error('Unable to resolve the note node id')
    }
    await surface.focus()
    await page.keyboard.press(COMMENT_SHORTCUT)

    const commentEditor = page.locator('[data-web-canvas-comment-editor="true"]')
    await expect(commentEditor).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-web-canvas-comment-input="true"]').fill('Board anchored feedback')
    await page.locator('[data-web-canvas-comment-save="true"]').click()

    const commentPin = page.locator('[data-canvas-comment-pin="true"]')
    await expect(commentPin).toBeVisible({ timeout: 30_000 })
    await selectCanvasNode(page, '.canvas-node[data-node-type="note"]', noteCountBefore)
    const noteBeforeMove = await noteNode.boundingBox()
    const pinBeforeMove = await commentPin.boundingBox()
    expect(noteBeforeMove).not.toBeNull()
    expect(pinBeforeMove).not.toBeNull()

    await moveCanvasNode(page, noteNodeId, 120, 0)

    await expect
      .poll(async () => (await noteNode.boundingBox())?.x ?? null, {
        timeout: 30_000
      })
      .toBeGreaterThan((noteBeforeMove?.x ?? 0) + 40)

    const noteAfterMove = await noteNode.boundingBox()
    const pinAfterMove = await commentPin.boundingBox()
    expect(noteAfterMove).not.toBeNull()
    expect(pinAfterMove).not.toBeNull()
    expect(
      Math.abs(
        (pinAfterMove?.x ?? 0) -
          (noteAfterMove?.x ?? 0) -
          ((pinBeforeMove?.x ?? 0) - (noteBeforeMove?.x ?? 0))
      )
    ).toBeLessThan(20)

    await removeCanvasNode(page, noteNodeId)

    const orphanTray = page.locator('[data-canvas-comment-orphan-tray="true"]')
    await expect(orphanTray).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-canvas-comment-orphan="true"]').click()
    await expect(
      page
        .getByLabel('Comment pins')
        .locator('.markdown-content')
        .getByText('Board anchored feedback')
    ).toBeVisible({ timeout: 30_000 })

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-comments.png',
      fullPage: true
    })
  })

  test('resizes selected canvas nodes and reports resize activity on the web', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)
    await createCanvas(page)

    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    const noteCountBefore = await createCanvasNote(page)

    await selectCanvasNode(page, '.canvas-node[data-node-type="note"]', noteCountBefore)
    const noteNode = page.locator('.canvas-node[data-node-type="note"]').nth(noteCountBefore)
    const noteNodeId = await noteNode.getAttribute('data-node-id')
    if (!noteNodeId) {
      throw new Error('Unable to resolve the note node id')
    }

    const initialRect = await getCanvasNodeRect(page, noteNodeId)
    await dragCanvasResizeHandle(page, '.canvas-node[data-node-type="note"]', noteCountBefore, {
      handle: 'bottom-right',
      dx: 96,
      dy: 72
    })

    await expect(surface).toHaveAttribute('data-canvas-local-activity', 'resizing', {
      timeout: 30_000
    })

    await releaseCanvasPointer(page)

    await expect
      .poll(async () => (await getCanvasNodeRect(page, noteNodeId)).width, { timeout: 30_000 })
      .toBeGreaterThan(initialRect.width + 60)
    await expect
      .poll(async () => (await getCanvasNodeRect(page, noteNodeId)).height, { timeout: 30_000 })
      .toBeGreaterThan(initialRect.height + 40)

    await expect(surface).toHaveAttribute('data-canvas-local-activity', 'idle', {
      timeout: 30_000
    })

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-resize.png',
      fullPage: true
    })
  })

  test('renders remote canvas presence overlays and activity diagnostics on the web', async ({
    page
  }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    const canvasId = await createCanvas(page)
    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })

    const noteCountBefore = await createCanvasNote(page)

    await selectCanvasNode(page, '.canvas-node[data-node-type="note"]', noteCountBefore)
    const noteNode = page.locator('.canvas-node[data-node-type="note"]').nth(noteCountBefore)
    const noteNodeId = await noteNode.getAttribute('data-node-id')
    if (!noteNodeId) {
      throw new Error('Unable to resolve the note node id')
    }

    const metrics = await getCanvasMetrics(page)
    await setCanvasRemotePresence(page, {
      canvasId,
      key: 'presence-peer',
      state: {
        user: {
          did: 'did:key:canvas-peer',
          name: 'Canvas Peer',
          color: '#22c55e'
        },
        selection: [noteNodeId],
        cursor: {
          x: metrics.viewportX + 96,
          y: metrics.viewportY + 48
        },
        activity: 'editing',
        editingNodeId: noteNodeId
      }
    })

    await expect(surface).toHaveAttribute('data-canvas-remote-user-count', '1')
    await expect(page.locator('[data-canvas-remote-cursor="true"]')).toContainText('Canvas Peer', {
      timeout: 30_000
    })
    await expect(noteNode.locator('[data-canvas-node-remote-user="true"]')).toHaveCount(1, {
      timeout: 30_000
    })

    await surface.focus()
    await page.keyboard.press(COMMENT_SHORTCUT)
    await expect(page.locator('[data-web-canvas-comment-editor="true"]')).toBeVisible({
      timeout: 30_000
    })
    await expect(surface).toHaveAttribute('data-canvas-local-activity', 'commenting')

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-presence.png',
      fullPage: true
    })

    await setCanvasRemotePresence(page, {
      canvasId,
      key: 'presence-peer',
      state: null
    })
    await expect(surface).toHaveAttribute('data-canvas-remote-user-count', '0', {
      timeout: 30_000
    })
  })

  test('keeps dense seeded scenes chunked and bounded on the web canvas', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    const canvasId = await createCanvas(page)
    const surface = page.locator('[data-canvas-surface="true"]')
    await expect(surface).toBeVisible({ timeout: 30_000 })
    await waitForCanvasDocument(page, canvasId)

    const seededScene = await seedPerformanceScene(page, {
      canvasId,
      title: 'Web Canvas Performance Validation',
      columns: 48,
      rows: 36,
      clusterColumns: 6,
      clusterRows: 4
    })

    await expect
      .poll(async () => (await getCanvasMetrics(page)).nodeCount, { timeout: 30_000 })
      .toBe(seededScene.nodeCount)
    await expect
      .poll(async () => (await getCanvasMetrics(page)).canvasNodeElements, { timeout: 30_000 })
      .toBeGreaterThan(0)

    const initialMetrics = await getCanvasMetrics(page)
    expect(initialMetrics.visibleNodeCount).toBeGreaterThan(0)
    expect(initialMetrics.domNodeCount).toBe(initialMetrics.canvasNodeElements)
    expect(initialMetrics.domNodeCount).toBeLessThanOrEqual(48)
    expect(['canvas', 'hybrid']).toContain(initialMetrics.edgeRenderMode)
    expect(initialMetrics.edgeCanvasCount + initialMetrics.edgeSvgCount).toBe(
      initialMetrics.visibleEdgeCount
    )
    if (initialMetrics.visibleEdgeCount > 0) {
      expect(initialMetrics.edgeCanvasCount).toBeGreaterThan(0)
    }
    expect(initialMetrics.contentEditableElements).toBe(0)
    expect(initialMetrics.tableElements).toBe(0)
    expect(initialMetrics.minimapRenderMode).toBe('aggregated')
    expect(initialMetrics.minimapRenderedNodeCount).toBeLessThan(initialMetrics.nodeCount)
    expect(initialMetrics.performanceEnabled).toBe(true)
    if (initialMetrics.renderMode === 'hybrid') {
      expect(initialMetrics.overviewNodeCount).toBeGreaterThan(0)
    }

    const initialViewport = {
      x: initialMetrics.viewportX,
      y: initialMetrics.viewportY
    }

    await surface.evaluate((element: HTMLElement) => {
      element.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaX: 420,
          deltaY: 260
        })
      )
    })

    await expect
      .poll(async () => {
        const metrics = await getCanvasMetrics(page)
        return `${metrics.viewportX}:${metrics.viewportY}`
      })
      .not.toBe(`${initialViewport.x}:${initialViewport.y}`)

    const postPanMetrics = await getCanvasMetrics(page)
    expect(postPanMetrics.domNodeCount).toBe(postPanMetrics.canvasNodeElements)
    expect(postPanMetrics.domNodeCount).toBeLessThanOrEqual(48)
    expect(['canvas', 'hybrid']).toContain(postPanMetrics.edgeRenderMode)
    expect(postPanMetrics.edgeCanvasCount + postPanMetrics.edgeSvgCount).toBe(
      postPanMetrics.visibleEdgeCount
    )
    if (postPanMetrics.visibleEdgeCount > 0) {
      expect(postPanMetrics.edgeCanvasCount).toBeGreaterThan(0)
    }
    expect(postPanMetrics.contentEditableElements).toBe(0)
    expect(postPanMetrics.tableElements).toBe(0)
    expect(postPanMetrics.minimapRenderMode).toBe('aggregated')
    expect(postPanMetrics.performanceEnabled).toBe(true)

    const frameBudget = await measureCanvasFrameBudget(page, {
      canvasId,
      steps: 18
    })

    expect(frameBudget.frameCount).toBeGreaterThan(0)
    expect(frameBudget.averageFrameTime).toBeLessThan(getPerformanceBudget(24, 40))
    expect(frameBudget.maxFrameTime).toBeLessThan(getPerformanceBudget(55, 90))
    expect(frameBudget.droppedFramePercent).toBeLessThan(getPerformanceBudget(45, 65))

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-performance.png',
      fullPage: true
    })
  })
})
