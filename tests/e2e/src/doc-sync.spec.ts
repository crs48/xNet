/**
 * E2E Browser Collaborative Doc Sync Test
 *
 * Spins up a hub + a minimal Vite test harness, then opens two browser tabs
 * (each with a different identity) pointing at the same document:
 *
 *   1. User 1 types into the editor
 *   2. Verify text appears in User 2's editor
 *   3. User 2 types into the editor
 *   4. Verify text appears in User 1's editor
 *
 * NOT part of the normal `pnpm test` suite.
 * Run manually:  cd tests/e2e && pnpm test
 */

import { test, expect, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

// ─── Config ──────────────────────────────────────────────────────────

const HUB_PORT = 14500
const HARNESS_PORT = 15200
const DOC_ID = `e2e-test-${Date.now()}`

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')

// ─── Helpers ─────────────────────────────────────────────────────────

/** Spawn a long-running process and resolve once stdout contains `readyText`. */
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

    // Strip ANSI escape codes for readyText matching
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

    proc.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== null && code !== 0) {
        reject(new Error(`${opts.label}: exited with code ${code}\nstdout: ${stdout}`))
      }
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

test.describe('Browser collaborative doc sync', () => {
  let hubProc: ChildProcess
  let harnessProc: ChildProcess
  let page1: Page
  let page2: Page

  test.beforeAll(async ({ browser }) => {
    // 1. Start hub (memory storage, no auth)
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

    // 2. Start the minimal Vite test harness
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

    // 3. Open two tabs with different user identities, same doc
    const baseUrl = `http://localhost:${HARNESS_PORT}`
    const hubWs = `ws://localhost:${HUB_PORT}`

    // Helper: wait for contenteditable editor in page context
    const waitForEditor = (pg: Page, label: string) =>
      pg
        .waitForFunction(() => document.querySelector('[contenteditable="true"]') !== null, {
          timeout: 60_000
        })
        .then(() => {
          if (process.env.E2E_DEBUG) process.stderr.write(`[${label}] Editor rendered\n`)
        })

    // Open page1 first and wait for it to fully initialize
    const context1 = await browser.newContext()
    page1 = await context1.newPage()
    if (process.env.E2E_DEBUG) {
      page1.on('console', (msg) =>
        process.stderr.write(`[page1:console] ${msg.type()}: ${msg.text()}\n`)
      )
    }
    await page1.goto(`${baseUrl}?user=1&doc=${DOC_ID}&hub=${encodeURIComponent(hubWs)}`)
    await waitForEditor(page1, 'page1')

    // Give page1 time to fully set up sync before opening page2
    await sleep(2000)

    // Now open page2
    const context2 = await browser.newContext()
    page2 = await context2.newPage()
    if (process.env.E2E_DEBUG) {
      page2.on('console', (msg) =>
        process.stderr.write(`[page2:console] ${msg.type()}: ${msg.text()}\n`)
      )
    }
    await page2.goto(`${baseUrl}?user=2&doc=${DOC_ID}&hub=${encodeURIComponent(hubWs)}`)
    await waitForEditor(page2, 'page2')

    // Wait for sync to stabilize
    await sleep(3000)
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

  test('two users can collaboratively edit a shared document', async () => {
    // Helper: get editor text via page.evaluate (avoids Playwright locator timing issues)
    const getEditorText = (pg: Page) =>
      pg.evaluate(() => {
        const el = document.querySelector('[contenteditable="true"]')
        return el?.textContent ?? ''
      })

    // Helper: type into editor via page.evaluate + keyboard
    const typeInEditor = async (pg: Page, text: string) => {
      await pg.evaluate(() => {
        const el = document.querySelector('[contenteditable="true"]') as HTMLElement
        el?.focus()
      })
      await sleep(200)
      await pg.keyboard.type(text, { delay: 30 })
    }

    // Helper: poll for text to appear in editor (handles re-render churn)
    const waitForText = async (pg: Page, text: string, label: string, timeoutMs = 20_000) => {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const content = await getEditorText(pg)
        if (content.includes(text)) return
        await sleep(500)
      }
      const finalContent = await getEditorText(pg)
      throw new Error(
        `${label}: text "${text}" not found after ${timeoutMs}ms. Content: "${finalContent}"`
      )
    }

    // ─── Step 1: User 1 types ────────────────────────────────────────
    const user1Text = 'Hello from User One'
    await typeInEditor(page1, user1Text)

    // Verify text is in User 1's editor
    await waitForText(page1, user1Text, 'page1', 5_000)
    if (process.env.E2E_DEBUG) process.stderr.write(`[test] User 1 typed successfully\n`)

    // ─── Step 2: Verify User 1's text appears in User 2 ──────────────
    await waitForText(page2, user1Text, 'page2-sync', 20_000)
    if (process.env.E2E_DEBUG) process.stderr.write(`[test] User 1 text synced to User 2\n`)

    // ─── Step 3: User 2 types ────────────────────────────────────────
    const user2Text = ' and greetings from User Two'
    // Move cursor to end first
    await page2.evaluate(() => {
      const el = document.querySelector('[contenteditable="true"]') as HTMLElement
      if (el) {
        el.focus()
        const sel = window.getSelection()
        if (sel) {
          sel.selectAllChildren(el)
          sel.collapseToEnd()
        }
      }
    })
    await sleep(200)
    await page2.keyboard.type(user2Text, { delay: 30 })

    // ─── Step 4: Verify User 2's text appears in User 1 ──────────────
    await waitForText(page1, 'User Two', 'page1-sync', 20_000)
    if (process.env.E2E_DEBUG) process.stderr.write(`[test] User 2 text synced to User 1\n`)

    // ─── Step 5: Final state - both editors have all text ────────────
    const [text1, text2] = await Promise.all([getEditorText(page1), getEditorText(page2)])
    expect(text1).toContain('Hello from User One')
    expect(text1).toContain('User Two')
    expect(text2).toContain('Hello from User One')
    expect(text2).toContain('User Two')

    // ─── Step 6: Verify hub is healthy ───────────────────────────────
    const healthRes = await fetch(`http://localhost:${HUB_PORT}/health`)
    const health = await healthRes.json()
    expect(health.status).toBe('ok')

    if (process.env.E2E_DEBUG) process.stderr.write(`[test] All assertions passed!\n`)
  })
})
