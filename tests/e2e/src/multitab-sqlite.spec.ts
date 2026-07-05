/**
 * Multi-tab SQLite leadership E2E (exploration 0263).
 *
 * Two tabs on one origin share ONE durable OPFS database: the first elects
 * itself leader via Web Locks, the second becomes a follower routed through
 * the SharedWorker ferry — instead of losing the OPFS handle race and
 * silently running on `:memory:` (the pre-0263 behaviour, exploration 0204).
 * Killing the leader promotes the follower and reads keep working.
 *
 * NOT part of the normal `pnpm test` suite. Run manually:
 *   cd tests/e2e && pnpm exec playwright test src/multitab-sqlite.spec.ts
 */

import type { ChildProcess } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'
import { forceFreePorts, killTree, startHarness } from '../helpers/harness'

const HARNESS_PORT = 15300
const HARNESS_URL = `http://localhost:${HARNESS_PORT}/multitab.html`

declare global {
  interface Window {
    __sqlite?: {
      role: () => string
      mode: () => Promise<string>
      run: (sql: string, params?: unknown[]) => Promise<unknown>
      query: (sql: string, params?: unknown[]) => Promise<unknown[]>
      multiTabSupported: boolean
    }
    __sqliteReady?: boolean
    __sqliteError?: string
  }
}

let harness: ChildProcess | undefined

test.beforeAll(async () => {
  forceFreePorts([HARNESS_PORT])
  harness = await startHarness(HARNESS_PORT)
})

test.afterAll(() => {
  killTree(harness)
})

async function openTab(page: Page): Promise<void> {
  await page.goto(HARNESS_URL)
  await page.waitForFunction(() => window.__sqliteReady === true || Boolean(window.__sqliteError), {
    timeout: 60_000
  })
  const error = await page.evaluate(() => window.__sqliteError)
  expect(error, 'harness boot error').toBeUndefined()
}

const getRole = (page: Page): Promise<string> => page.evaluate(() => window.__sqlite!.role())
const getMode = (page: Page): Promise<string> => page.evaluate(() => window.__sqlite!.mode())

test('two tabs share one durable database; leader death promotes the follower', async ({
  browser,
  browserName
}) => {
  const context = await browser.newContext()
  const tabA = await context.newPage()
  await openTab(tabA)

  const supported = await tabA.evaluate(() => window.__sqlite!.multiTabSupported)
  const modeA = await getMode(tabA)

  if (!supported) {
    // Degraded environments (no SharedWorker — Android Chrome) keep the
    // pre-0263 single-tab behaviour: the first tab must still open storage.
    expect(await getRole(tabA)).toBe('single-tab')
    expect(['opfs', 'memory']).toContain(modeA)
    await context.close()
    return
  }

  expect(await getRole(tabA)).toBe('leader')
  // Playwright's WebKit build lacks OPFS sync access handles, so even the
  // leader legitimately falls back to memory there; the leadership routing
  // under test is orthogonal to which backend the LEADER got. Chromium must
  // be strictly durable.
  if (browserName === 'chromium') {
    expect(modeA).toBe('opfs')
  }

  // Tab B: follower routed to the leader's worker — SAME database and mode
  // as the leader (the pre-0263 bug forced followers to their own :memory:).
  const tabB = await context.newPage()
  await openTab(tabB)
  expect(await getRole(tabB)).toBe('follower')
  expect(await getMode(tabB)).toBe(modeA)

  // Cross-tab read-your-writes through ONE database: B writes, A reads.
  const marker = `from-tab-b-${Date.now()}`
  await tabB.evaluate(
    (note) => window.__sqlite!.run('INSERT INTO e2e_multitab (note) VALUES (?)', [note]),
    marker
  )
  const rowsSeenByA = await tabA.evaluate(
    (note) => window.__sqlite!.query('SELECT note FROM e2e_multitab WHERE note = ?', [note]),
    marker
  )
  expect(rowsSeenByA).toEqual([{ note: marker }])

  // Kill the leader: the follower must promote and keep serving.
  await tabA.close()
  await expect
    .poll(() => getRole(tabB), { timeout: 20_000, message: 'follower should promote to leader' })
    .toBe('leader')

  if (modeA === 'opfs') {
    // Durable backend: the promoted leader reopens the SAME file — the write
    // survives the previous leader's death.
    expect(await getMode(tabB)).toBe('opfs')
    const rowsAfterPromotion = await tabB.evaluate(
      (note) => window.__sqlite!.query('SELECT note FROM e2e_multitab WHERE note = ?', [note]),
      marker
    )
    expect(rowsAfterPromotion).toEqual([{ note: marker }])
  } else {
    // Memory backend (WebKit-in-Playwright): the data (and schema) died with
    // the old leader's worker, but the promoted tab must still serve queries.
    const rows = await tabB.evaluate(() => window.__sqlite!.query('SELECT 1 AS n', []))
    expect(rows).toEqual([{ n: 1 }])
  }

  await context.close()
})
