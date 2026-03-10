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

test.describe('Web canvas ingestion', () => {
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
