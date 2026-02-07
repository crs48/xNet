/**
 * E2E Column UI Integration Test
 *
 * Tests the Column Configuration UI components:
 * - AddColumnModal: Opening, type selection, configuration
 * - SelectOptionsEditor: Adding, editing, deleting options
 *
 * Uses a minimal test harness that renders only the column UI components.
 * Run manually: cd tests/e2e && pnpm test
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { test, expect, type Page } from '@playwright/test'

// ─── Config ──────────────────────────────────────────────────────────

const HARNESS_PORT = 15202
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')

// ─── Helpers ─────────────────────────────────────────────────────────

function spawnAndWait(
  command: string,
  args: string[],
  opts: {
    cwd: string
    env?: Record<string, string>
    readyText: string
    timeoutMs?: number
    label: string
  }
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${opts.label}: timed out waiting for "${opts.readyText}"`)),
      opts.timeoutMs ?? 30_000
    )

    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true
    })

    let stdout = ''
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (process.env.E2E_DEBUG) process.stderr.write(`[${opts.label}] ${text}`)
      if (stripAnsi(stdout).includes(opts.readyText)) {
        clearTimeout(timer)
        resolve(proc)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      if (process.env.E2E_DEBUG) process.stderr.write(`[${opts.label}:err] ${chunk.toString()}`)
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function killTree(proc: ChildProcess): void {
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGTERM')
  } catch {
    try {
      proc.kill('SIGTERM')
    } catch {
      // already dead
    }
  }
}

// ─── Test ────────────────────────────────────────────────────────────

test.describe('Column UI Components', () => {
  let harnessProc: ChildProcess
  let page: Page

  test.beforeAll(async ({ browser }) => {
    // Start the test harness with column-ui.html
    harnessProc = await spawnAndWait(
      'pnpm',
      ['exec', 'vite', '--config', 'harness/vite.config.ts'],
      {
        cwd: `${ROOT}/tests/e2e`,
        env: { HARNESS_PORT: String(HARNESS_PORT) },
        readyText: `localhost:${HARNESS_PORT}`,
        label: 'harness',
        timeoutMs: 30_000
      }
    )

    // Open browser to column-ui harness
    const context = await browser.newContext()
    page = await context.newPage()

    if (process.env.E2E_DEBUG) {
      page.on('console', (msg) =>
        process.stderr.write(`[page:console] ${msg.type()}: ${msg.text()}\n`)
      )
    }

    await page.goto(`http://localhost:${HARNESS_PORT}/column-ui.html`)

    // Wait for the app to load
    await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 })
    await sleep(500)
  })

  test.afterAll(async () => {
    if (harnessProc) killTree(harnessProc)

    await sleep(500)

    // Force-kill any stragglers
    try {
      const { execSync } = await import('node:child_process')
      execSync(`lsof -ti:${HARNESS_PORT} 2>/dev/null | xargs kill -9 2>/dev/null`, {
        stdio: 'ignore'
      })
    } catch {
      // port already clear
    }
  })

  test('loads the column UI test harness', async () => {
    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-01-initial.png` })

    await expect(page.getByTestId('title')).toContainText('Column UI E2E Test')
    await expect(page.getByTestId('column-count')).toContainText('0')
    await expect(page.getByTestId('option-count')).toContainText('2')

    console.log('Initial state verified')
  })

  test('AddColumnModal - can open and close modal', async () => {
    // Open modal
    await page.getByTestId('open-modal').click()
    await sleep(300)

    // Modal should be visible - check for the header (h2 with exact text)
    await expect(page.locator('h2').getByText('Add Column')).toBeVisible()
    // Check category headers are visible
    await expect(page.getByText('Basic')).toBeVisible()
    await expect(page.getByText('Selection')).toBeVisible()
    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-02-modal-open.png` })

    console.log('Modal opened')

    // Close modal by pressing Escape
    await page.keyboard.press('Escape')
    await sleep(300)

    // Modal should be closed - category headers shouldn't be visible
    await expect(page.getByText('Basic')).not.toBeVisible()

    console.log('Modal closed with Escape')
  })

  test('AddColumnModal - can create a Text column', async () => {
    // Open modal
    await page.getByTestId('open-modal').click()
    await sleep(300)

    // Click on Text type button (contains "Aa" icon and "Text" label)
    await page.locator('button:has-text("Aa"):has-text("Text")').click()
    await sleep(300)

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-03-text-selected.png` })

    // Should now be on config step with default name "Text"
    const nameInput = page.locator('input[placeholder="Enter column name..."]')
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue('Text')

    // Change the name
    await nameInput.clear()
    await nameInput.fill('My Text Column')

    // Click Add Column button in the footer
    await page.locator('button:has-text("Add Column")').last().click()
    await sleep(300)

    // Modal should close and column count should be 1
    await expect(page.getByTestId('column-count')).toContainText('1')
    await expect(page.getByTestId('column-0-name')).toContainText('My Text Column')
    await expect(page.getByTestId('column-0-type')).toContainText('text')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-04-text-created.png` })

    console.log('Text column created successfully')
  })

  test('AddColumnModal - can create a Select column with options', async () => {
    // Open modal
    await page.getByTestId('open-modal').click()
    await sleep(300)

    // Click on Select type button
    await page.locator('button:has-text("▼"):has-text("Select")').click()
    await sleep(300)

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-05-select-type.png` })

    // Should show options editor label (first match in modal)
    await expect(page.locator('.fixed label:has-text("Options")').first()).toBeVisible()

    // Add some options - need to target the modal's option input
    const modalOptionInput = page.locator('.fixed input[placeholder="Add an option..."]')
    await modalOptionInput.fill('Option A')
    await modalOptionInput.press('Enter')
    await sleep(200)

    await modalOptionInput.fill('Option B')
    await modalOptionInput.press('Enter')
    await sleep(200)

    await modalOptionInput.fill('Option C')
    await modalOptionInput.press('Enter')
    await sleep(200)

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-06-select-options.png` })

    // Change the name
    const nameInput = page.locator('input[placeholder="Enter column name..."]')
    await nameInput.clear()
    await nameInput.fill('Status')

    // Click Add Column button in the footer
    await page.locator('button:has-text("Add Column")').last().click()
    await sleep(300)

    // Should have 2 columns now
    await expect(page.getByTestId('column-count')).toContainText('2')
    await expect(page.getByTestId('column-1-name')).toContainText('Status')
    await expect(page.getByTestId('column-1-type')).toContainText('select')
    await expect(page.getByTestId('column-1-config')).toContainText('Option A')
    await expect(page.getByTestId('column-1-config')).toContainText('Option B')
    await expect(page.getByTestId('column-1-config')).toContainText('Option C')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-07-select-created.png` })

    console.log('Select column with options created successfully')
  })

  test('AddColumnModal - can create a Number column with currency format', async () => {
    // Get current column count
    const initialCount = await page.getByTestId('column-count').textContent()
    const startCount = parseInt(initialCount || '0', 10)

    // Open modal
    await page.getByTestId('open-modal').click()
    await sleep(300)

    // Click on Number type button
    await page.locator('button:has-text("#"):has-text("Number")').click()
    await sleep(300)

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-08-number-type.png` })

    // Should show format selector
    await expect(page.locator('.fixed').getByText('Format')).toBeVisible()

    // Select currency format
    const formatSelect = page.locator('.fixed select').first()
    await formatSelect.selectOption('currency')
    await sleep(200)

    // Should now show currency selector label
    await expect(page.locator('.fixed label:has-text("Currency")')).toBeVisible()

    // Select EUR
    const currencySelect = page.locator('.fixed select').nth(1)
    await currencySelect.selectOption('EUR')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-09-currency-config.png` })

    // Change the name
    const nameInput = page.locator('input[placeholder="Enter column name..."]')
    await nameInput.clear()
    await nameInput.fill('Price')

    // Click Add Column button in the footer
    await page.locator('button:has-text("Add Column")').last().click()
    await sleep(300)

    // Should have one more column
    const expectedCount = startCount + 1
    await expect(page.getByTestId('column-count')).toContainText(String(expectedCount))

    // Get the last column index
    const lastColIndex = expectedCount - 1
    await expect(page.getByTestId(`column-${lastColIndex}-name`)).toContainText('Price')
    await expect(page.getByTestId(`column-${lastColIndex}-type`)).toContainText('number')
    await expect(page.getByTestId(`column-${lastColIndex}-config`)).toContainText('currency')
    await expect(page.getByTestId(`column-${lastColIndex}-config`)).toContainText('EUR')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-10-number-created.png` })

    console.log('Number column with currency format created successfully')
  })

  test('SelectOptionsEditor - can add new options', async () => {
    // The standalone options editor should have 2 options initially
    await expect(page.getByTestId('option-count')).toContainText('2')

    // Add a new option
    const optionInput = page.getByTestId('options-editor').getByPlaceholder('Add an option...')
    await optionInput.fill('New Option')
    await optionInput.press('Enter')
    await sleep(200)

    // Should now have 3 options
    await expect(page.getByTestId('option-count')).toContainText('3')

    // Verify the new option appears in the state
    await expect(page.getByTestId('options-state')).toContainText('New Option')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-11-option-added.png` })

    console.log('Option added successfully')
  })

  test('SelectOptionsEditor - can edit option names', async () => {
    // Click on "Option 1" to edit it
    await page.getByTestId('options-editor').getByText('Option 1').click()
    await sleep(200)

    // Should show input
    const input = page.getByTestId('options-editor').locator('input[type="text"]').first()
    await expect(input).toBeVisible()

    // Clear and type new name
    await input.clear()
    await input.fill('Renamed Option')
    await input.press('Enter')
    await sleep(200)

    // Verify the option was renamed
    await expect(page.getByTestId('options-state')).toContainText('Renamed Option')
    await expect(page.getByTestId('options-state')).not.toContainText('"name": "Option 1"')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-12-option-renamed.png` })

    console.log('Option renamed successfully')
  })

  test('SelectOptionsEditor - can delete options', async () => {
    const initialCount = await page.getByTestId('option-count').textContent()
    const count = parseInt(initialCount || '0', 10)

    // Click delete button on first option
    const deleteButtons = page.getByTestId('options-editor').getByTitle('Delete option')
    await deleteButtons.first().click()
    await sleep(200)

    // Should have one less option
    await expect(page.getByTestId('option-count')).toContainText(String(count - 1))

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-13-option-deleted.png` })

    console.log('Option deleted successfully')
  })

  test('SelectOptionsEditor - can clear all options', async () => {
    // Click clear all button
    await page.getByTestId('clear-options').click()
    await sleep(200)

    // Should have 0 options
    await expect(page.getByTestId('option-count')).toContainText('0')

    // Should show empty state
    await expect(page.getByTestId('options-editor')).toContainText('No options yet')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-14-options-cleared.png` })

    console.log('All options cleared successfully')
  })

  test('can clear all created columns', async () => {
    // Clear columns
    await page.getByTestId('clear-columns').click()
    await sleep(200)

    await expect(page.getByTestId('column-count')).toContainText('0')
    await expect(page.getByTestId('created-columns')).toContainText('No columns created yet')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/column-ui-15-final.png` })

    console.log('All tests completed successfully!')
  })
})
