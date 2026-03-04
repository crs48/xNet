/**
 * E2E Database Functionality Test
 *
 * Tests the database data model features implemented in Phase 3-5:
 * - Creating a database
 * - Adding columns
 * - Adding rows
 * - Table and Board view switching
 *
 * Uses a minimal test harness instead of the full Electron app.
 * Run manually: cd tests/e2e && pnpm test
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { test, expect, type Page } from '@playwright/test'

// ─── Config ──────────────────────────────────────────────────────────

const HARNESS_PORT = 15201
const HUB_PORT = 14501
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

test.describe('Database functionality', () => {
  let hubProc: ChildProcess
  let harnessProc: ChildProcess
  let page: Page

  test.beforeAll(async ({ browser }) => {
    // 1. Start hub (memory storage, no auth)
    hubProc = await spawnAndWait(
      'pnpm',
      [
        '--filter',
        '@xnetjs/hub',
        'exec',
        'tsx',
        'src/cli.ts',
        '--port',
        String(HUB_PORT),
        '--no-auth',
        '--storage',
        'memory'
      ],
      {
        cwd: ROOT,
        readyText: `listening on port ${HUB_PORT}`,
        label: 'hub',
        timeoutMs: 20_000
      }
    )

    // 2. Start the test harness with database.html
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

    // 3. Open browser to database harness
    const context = await browser.newContext()
    page = await context.newPage()

    if (process.env.E2E_DEBUG) {
      page.on('console', (msg) =>
        process.stderr.write(`[page:console] ${msg.type()}: ${msg.text()}\n`)
      )
    }

    const hubWs = `ws://localhost:${HUB_PORT}`
    await page.goto(
      `http://localhost:${HARNESS_PORT}/database.html?user=1&hub=${encodeURIComponent(hubWs)}`
    )

    // Wait for the app to load
    await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 })
    await sleep(1000)
  })

  test.afterAll(async () => {
    if (harnessProc) killTree(harnessProc)
    if (hubProc) killTree(hubProc)

    await sleep(1000)

    // Force-kill any stragglers
    for (const port of [HUB_PORT, HARNESS_PORT]) {
      try {
        const { execSync } = await import('node:child_process')
        execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
      } catch {
        // port already clear
      }
    }
  })

  test('can create database with columns and rows', async () => {
    // Take initial screenshot
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-01-initial.png` })

    // Verify initial state
    await expect(page.getByTestId('title')).toContainText('Database E2E Test')
    await expect(page.getByTestId('column-count')).toContainText('0')
    await expect(page.getByTestId('row-count')).toContainText('0')
    await expect(page.getByTestId('empty-state')).toBeVisible()

    console.log('Initial state verified')

    // Add a text column
    await page.getByTestId('add-column').click()
    await sleep(500)
    await expect(page.getByTestId('column-count')).toContainText('1')
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-02-text-column.png` })

    console.log('Text column added')

    // Add a status column (for board view)
    await page.getByTestId('add-select-column').click()
    await sleep(500)
    await expect(page.getByTestId('column-count')).toContainText('2')
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-03-status-column.png` })

    console.log('Status column added')

    // Add a row
    await page.getByTestId('add-row').click()
    await sleep(500)
    await expect(page.getByTestId('row-count')).toContainText('1')
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-04-first-row.png` })

    console.log('First row added')

    // Add more rows
    await page.getByTestId('add-row').click()
    await page.getByTestId('add-row').click()
    await sleep(500)
    await expect(page.getByTestId('row-count')).toContainText('3')
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-05-three-rows.png` })

    console.log('Three rows added')

    // Switch to board view
    await page.getByTestId('view-board').click()
    await sleep(500)
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-06-board-view.png` })

    console.log('Board view displayed')

    // Switch back to table view
    await page.getByTestId('view-table').click()
    await sleep(500)
    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-07-table-view.png` })

    console.log('Table view displayed')

    // Final verification
    await expect(page.getByTestId('column-count')).toContainText('2')
    await expect(page.getByTestId('row-count')).toContainText('3')

    console.log('Test completed successfully!')
  })
})
