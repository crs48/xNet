/**
 * E2E — V2 Database undo/redo
 *
 * Verifies the scoped node-op undo that backs the grid (useUndoScope):
 * - a committed cell edit undoes back to its previous value and redoes
 * - the grid's Cmd/Ctrl+Z path triggers the same scoped undo
 * - one user action maps to one undo step
 *
 * Run manually: cd tests/e2e && pnpm exec playwright test src/database-undo.spec.ts
 */

import type { ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { test, expect, type Page } from '@playwright/test'
import { forceFreePorts, killTree, startHarness, startHub } from '../helpers/harness'

const HARNESS_PORT = 15202
const HUB_PORT = 14502

const DB_ID = `e2e-undo-${Date.now()}`

test.describe.configure({ mode: 'serial' })

test.describe('Database V2 undo/redo', () => {
  let hubProc: ChildProcess
  let harnessProc: ChildProcess
  let page: Page

  test.beforeAll(async ({ browser }) => {
    hubProc = await startHub(HUB_PORT)
    harnessProc = await startHarness(HARNESS_PORT)

    const context = await browser.newContext()
    page = await context.newPage()
    const hubWs = `ws://localhost:${HUB_PORT}`
    await page.goto(
      `http://localhost:${HARNESS_PORT}/database.html?user=1&db=${DB_ID}&hub=${encodeURIComponent(hubWs)}`
    )
    await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 })
    await sleep(1000)
  })

  test.afterAll(async () => {
    killTree(harnessProc)
    killTree(hubProc)
    await sleep(1000)
    forceFreePorts([HUB_PORT, HARNESS_PORT])
  })

  test('cell edit undoes and redoes as one step', async () => {
    // Seed: Title/Status/Tags fields + one row titled 'Initial'
    await page.getByTestId('seed-undo-fixture').click()
    await expect(page.getByTestId('column-count')).toContainText('3', { timeout: 15_000 })
    await expect(page.getByTestId('row-count')).toContainText('1')
    await expect(page.getByTestId('first-row-title')).toContainText('Initial')
    await expect(page.getByTestId('status-column-type')).toContainText('select')

    // Programmatic cell edit (single node op)
    await page.getByTestId('edit-title-cell').click()
    await expect(page.getByTestId('first-row-title')).toContainText('Edited title')
    await expect(page.getByTestId('can-undo')).toContainText('true', { timeout: 10_000 })

    // Undo restores the previous value; redo reapplies it
    await page.getByTestId('undo-action').click()
    await expect(page.getByTestId('first-row-title')).toContainText('Initial', {
      timeout: 10_000
    })

    await page.getByTestId('redo-action').click()
    await expect(page.getByTestId('first-row-title')).toContainText('Edited title', {
      timeout: 10_000
    })
  })

  test('grid keyboard edit + Cmd/Ctrl+Z undoes the commit', async () => {
    // Fresh database so the undo stack contains exactly one edit
    const hubWs = `ws://localhost:${HUB_PORT}`
    await page.goto(
      `http://localhost:${HARNESS_PORT}/database.html?user=1&db=${DB_ID}-kbd&hub=${encodeURIComponent(hubWs)}`
    )
    await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 })
    await page.getByTestId('seed-undo-fixture').click()
    await expect(page.getByTestId('first-row-title')).toContainText('Initial', {
      timeout: 15_000
    })

    const cell = page.locator('[data-row-index="0"][data-col-index="0"]')
    await cell.click()
    await page.keyboard.type('Keyboard edit')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('first-row-title')).toContainText('Keyboard edit')

    // Focus stays on the grid (cursor moved down after commit); Cmd/Ctrl+Z
    // routes through the keymap to the scoped undo
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await expect(page.getByTestId('first-row-title')).toContainText('Initial', {
      timeout: 10_000
    })
  })
})
