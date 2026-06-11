/**
 * E2E — V2 Database Grid (exploration 0159)
 *
 * Drives the real grid stack (useGridDatabase + GridSurface + GridToolbar)
 * through the database harness:
 * - field/row creation and counts
 * - keyboard cell editing (click, type-to-replace, Enter commit)
 * - typeahead select option creation (persisted SelectOption nodes)
 * - header sort toggle
 * - two-user hub sync: edits and typeahead-created options converge
 *
 * Run manually: cd tests/e2e && pnpm exec playwright test src/database.spec.ts
 */

import type { ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { test, expect, type Page } from '@playwright/test'
import { ROOT, forceFreePorts, killTree, startHarness, startHub } from '../helpers/harness'

const HARNESS_PORT = 15201
const HUB_PORT = 14501

const DB_ID = `e2e-grid-${Date.now()}`

function harnessUrl(user: number): string {
  const hubWs = `ws://localhost:${HUB_PORT}`
  return `http://localhost:${HARNESS_PORT}/database.html?user=${user}&db=${DB_ID}&hub=${encodeURIComponent(hubWs)}`
}

async function gridCell(page: Page, row: number, col: number) {
  return page.locator(`[data-row-index="${row}"][data-col-index="${col}"]`)
}

test.describe.configure({ mode: 'serial' })

test.describe('Database V2 grid', () => {
  let hubProc: ChildProcess
  let harnessProc: ChildProcess
  let page: Page

  test.beforeAll(async ({ browser }) => {
    hubProc = await startHub(HUB_PORT)
    harnessProc = await startHarness(HARNESS_PORT)

    const context = await browser.newContext()
    page = await context.newPage()
    if (process.env.E2E_DEBUG) {
      page.on('console', (msg) =>
        process.stderr.write(`[page:console] ${msg.type()}: ${msg.text()}\n`)
      )
    }
    await page.goto(harnessUrl(1))
    await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 })
    await sleep(1000)
  })

  test.afterAll(async () => {
    killTree(harnessProc)
    killTree(hubProc)
    await sleep(1000)
    forceFreePorts([HUB_PORT, HARNESS_PORT])
  })

  test('creates fields and rows through the V2 hook', async () => {
    await expect(page.getByTestId('column-count')).toContainText('0')
    await expect(page.getByTestId('row-count')).toContainText('0')
    await expect(page.getByTestId('empty-state')).toBeVisible()

    await page.getByTestId('add-column').click()
    await expect(page.getByTestId('column-count')).toContainText('1')

    await page.getByTestId('add-select-column').click()
    await expect(page.getByTestId('column-count')).toContainText('2')

    await page.getByTestId('add-row').click()
    await page.getByTestId('add-row').click()
    await page.getByTestId('add-row').click()
    await expect(page.getByTestId('row-count')).toContainText('3')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/grid-01-structure.png` })
  })

  test('keyboard editing: type-to-replace, Enter commits and moves down', async () => {
    const cell = await gridCell(page, 0, 0)
    await cell.click()

    // Type-to-replace seeds the editor with the first character
    await page.keyboard.type('Hello grid')
    await page.keyboard.press('Enter')

    await expect(await gridCell(page, 0, 0)).toContainText('Hello grid')
    await expect(page.getByTestId('first-row-title')).toContainText('Hello grid')

    // Tab navigation from the second row (Enter moved the cursor down)
    await page.keyboard.type('Second row')
    await page.keyboard.press('Enter')
    await expect(await gridCell(page, 1, 0)).toContainText('Second row')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/grid-02-typed.png` })
  })

  test('typeahead creates a select option and persists it', async () => {
    // Status column is col index 1
    const statusCell = await gridCell(page, 0, 1)
    await statusCell.click()
    await page.keyboard.press('Enter')

    // Combobox opens; type a new tag name and create it
    const combobox = page.locator('[data-row-index="0"][data-col-index="1"] [role="combobox"]')
    await combobox.fill('Urgent')
    await expect(page.getByText('＋ Create "Urgent"')).toBeVisible()
    await page.keyboard.press('Enter')

    // Chip renders from the persisted SelectOption node
    await expect(await gridCell(page, 0, 1)).toContainText('Urgent')

    // Reopening offers the existing option instead of create
    await (await gridCell(page, 1, 1)).click()
    await page.keyboard.press('Enter')
    await combobox.first()
    const secondCombobox = page.locator(
      '[data-row-index="1"][data-col-index="1"] [role="combobox"]'
    )
    await secondCombobox.fill('Urg')
    await expect(page.getByRole('option').first()).toContainText('Urgent')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/grid-03-tags.png` })
  })

  test('header click toggles sorting', async () => {
    const header = page.locator('[data-grid-header][data-field-id]').first()
    await header.click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await header.click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await header.click()
    await expect(header).not.toHaveAttribute('aria-sort', /.+/)
  })

  test('two users converge through the hub', async ({ browser }) => {
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()
    if (process.env.E2E_DEBUG) {
      page2.on('console', (msg) =>
        process.stderr.write(`[page2:console] ${msg.type()}: ${msg.text()}\n`)
      )
    }
    await page2.goto(harnessUrl(2))
    await page2.waitForSelector('[data-testid="title"]', { timeout: 30_000 })

    // User 2 sees user 1's structure and data
    await expect(page2.getByTestId('column-count')).toContainText('2', { timeout: 20_000 })
    await expect(page2.getByTestId('row-count')).toContainText('3', { timeout: 20_000 })
    await expect(page2.getByTestId('first-row-title')).toContainText('Hello grid', {
      timeout: 20_000
    })

    // User 2 edits a cell; user 1 sees it
    const cell2 = page2.locator('[data-row-index="0"][data-col-index="0"]')
    await cell2.click()
    await page2.keyboard.type('From user two')
    await page2.keyboard.press('Enter')
    await expect(page.getByTestId('first-row-title')).toContainText('From user two', {
      timeout: 20_000
    })

    await page.screenshot({ path: `${ROOT}/tmp/playwright/grid-04-sync-user1.png` })
    await page2.screenshot({ path: `${ROOT}/tmp/playwright/grid-05-sync-user2.png` })
    await context2.close()
  })
})
