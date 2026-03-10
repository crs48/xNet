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

test.describe('Web canvas ingestion', () => {
  test('creates source-backed URL and media objects from drops', async ({ page }) => {
    await setupTestAuth(page)
    await advanceOnboarding(page)

    await expect(page.getByRole('heading', { name: /all documents/i })).toBeVisible({
      timeout: 30_000
    })

    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /^Canvas$/ }).click()

    await page.waitForURL(/\/canvas\//, { timeout: 30_000 })

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
})
