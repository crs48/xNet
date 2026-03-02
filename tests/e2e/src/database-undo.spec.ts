/**
 * E2E Database Undo/Redo Test
 *
 * Verifies database keyboard undo/redo for:
 * - text cell updates
 * - multiSelect cell updates
 * - row create/delete
 * - column type changes
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { test, expect, type Page } from '@playwright/test'

const HARNESS_PORT = 15211
const HUB_PORT = 14511
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')

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
      if (stripAnsi(stdout).includes(opts.readyText)) {
        clearTimeout(timer)
        resolve(proc)
      }
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

test.describe('Database undo/redo shortcuts', () => {
  let hubProc: ChildProcess
  let harnessProc: ChildProcess
  let page: Page

  test.beforeAll(async ({ browser }) => {
    hubProc = await spawnAndWait(
      'pnpm',
      [
        '--filter',
        '@xnet/hub',
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

    const context = await browser.newContext()
    page = await context.newPage()

    const hubWs = `ws://localhost:${HUB_PORT}`
    await page.goto(
      `http://localhost:${HARNESS_PORT}/database.html?user=1&hub=${encodeURIComponent(hubWs)}`
    )

    await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 })
    await sleep(800)
  })

  test.afterAll(async () => {
    if (harnessProc) killTree(harnessProc)
    if (hubProc) killTree(hubProc)

    await sleep(500)

    for (const port of [HUB_PORT, HARNESS_PORT]) {
      try {
        const { execSync } = await import('node:child_process')
        execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
      } catch {
        // already clear
      }
    }
  })

  test('undoes and redoes cell edits, row operations, and column type changes', async () => {
    await page.getByTestId('seed-undo-fixture').click()

    await expect(page.getByTestId('column-count')).toContainText('3')
    await expect(page.getByTestId('row-count')).toContainText('1')
    await expect(page.getByTestId('first-row-title')).toContainText('Initial')
    await expect(page.getByTestId('first-row-tags')).toContainText('[]')
    await expect(page.getByTestId('status-column-type')).toContainText('select')

    await page.getByTestId('edit-title-cell').click()
    await page.getByTestId('edit-tags-cell').click()
    await page.getByTestId('add-row').click()
    await page.getByTestId('delete-last-row').click()
    await page.getByTestId('change-status-type').click()

    await expect(page.getByTestId('first-row-title')).toContainText('Edited title')
    await expect(page.getByTestId('first-row-tags')).toContainText('opt-a')
    await expect(page.getByTestId('row-count')).toContainText('1')
    await expect(page.getByTestId('status-column-type')).toContainText('multiSelect')

    await page.getByTestId('cell-row-1-title').click()

    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('status-column-type')).toContainText('select')

    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('row-count')).toContainText('2')

    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('row-count')).toContainText('1')

    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('first-row-tags')).toContainText('[]')

    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('first-row-title')).toContainText('Initial')

    // Validate Windows/Linux redo shortcut parity (Ctrl+Y)
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('first-row-title')).toContainText('Edited title')

    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(page.getByTestId('first-row-tags')).toContainText('opt-a')

    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(page.getByTestId('row-count')).toContainText('2')

    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(page.getByTestId('row-count')).toContainText('1')

    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(page.getByTestId('status-column-type')).toContainText('multiSelect')

    await page.screenshot({ path: `${ROOT}/tmp/playwright/db-undo-final.png` })
  })
})
