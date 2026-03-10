import { expect, test } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

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

  const match = page.url().match(/\/canvas\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Unable to resolve canvas id from ${page.url()}`)
  }

  return match[1]
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
  domNodeCount: number
  overviewNodeCount: number
  renderMode: string
  viewportX: number
  viewportY: number
  canvasNodeElements: number
  minimapRenderedNodeCount: number
  minimapRenderMode: string
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
      domNodeCount: Number(surface.dataset.domNodeCount ?? 0),
      overviewNodeCount: Number(surface.dataset.overviewNodeCount ?? 0),
      renderMode: surface.dataset.canvasRenderMode ?? 'dom',
      viewportX: Number(surface.dataset.viewportX ?? 0),
      viewportY: Number(surface.dataset.viewportY ?? 0),
      canvasNodeElements: document.querySelectorAll('.canvas-node').length,
      minimapRenderedNodeCount: Number(minimap?.dataset.canvasMinimapRenderedNodeCount ?? 0),
      minimapRenderMode: minimap?.dataset.canvasMinimapRenderMode ?? 'full'
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

    await page.getByRole('button', { name: 'Note' }).click()
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
    expect(initialMetrics.minimapRenderMode).toBe('aggregated')
    expect(initialMetrics.minimapRenderedNodeCount).toBeLessThan(initialMetrics.nodeCount)
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
    expect(postPanMetrics.minimapRenderMode).toBe('aggregated')

    await page.screenshot({
      path: 'tmp/playwright/web-canvas-performance.png',
      fullPage: true
    })
  })
})
