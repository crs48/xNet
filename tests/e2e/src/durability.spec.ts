/**
 * Browser storage durability E2E (exploration 0272, Pillar 3).
 *
 * Reload-mid-write-burst against REAL OPFS through the real worker adapter
 * (the multitab harness page): a page commits a baseline, then fires a long
 * sequential insert burst and reloads itself mid-stream — the browser
 * equivalent of killing the process while the write queue is hot. After the
 * reload the database must:
 *
 *   1. pass PRAGMA integrity_check,
 *   2. retain every committed row (no committed data lost),
 *   3. contain a gap-free, un-torn prefix of the burst (single-statement
 *      inserts commit in queue order — a gap or malformed row means torn
 *      writes), and
 *   4. converge under deterministic replay (INSERT OR REPLACE of the full
 *      sequence lands the exact final state — the storage-level analogue of
 *      the re-sync after a crash; transport-level convergence is
 *      sync-matrix.spec.ts's job).
 *
 * Like multitab-sqlite.spec.ts this drives the BUILT @xnetjs/sqlite dist, so
 * `pnpm --filter @xnetjs/sqlite build` must have run. NOT part of the normal
 * PR suite — the soak workflow runs it nightly:
 *   cd tests/e2e && pnpm exec playwright test src/durability.spec.ts --project=chromium
 */

import type { ChildProcess } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'
import { forceFreePorts, killTree, startHarness } from '../helpers/harness'

const HARNESS_PORT = 15310
const HARNESS_URL = `http://localhost:${HARNESS_PORT}/multitab.html`

const BASELINE_ROWS = 50
const BURST_ROWS = 500
const TOTAL_ROWS = BASELINE_ROWS + BURST_ROWS

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

async function openReady(page: Page): Promise<void> {
  await page.goto(HARNESS_URL)
  await page.waitForFunction(() => window.__sqliteReady === true || Boolean(window.__sqliteError), {
    timeout: 60_000
  })
  const error = await page.evaluate(() => window.__sqliteError)
  expect(error, 'harness boot error').toBeUndefined()
}

test('committed rows survive a reload mid write-burst, prefix is gap-free, replay converges', async ({
  browser
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await openReady(page)

  const mode = await page.evaluate(() => window.__sqlite!.mode())
  test.skip(mode !== 'opfs', `storage mode is '${mode}' — durability is only testable on OPFS`)

  // Clean slate + committed baseline.
  await page.evaluate(async (baseline) => {
    const sql = window.__sqlite!
    await sql.run('DROP TABLE IF EXISTS e2e_durability', [])
    await sql.run('CREATE TABLE e2e_durability (id INTEGER PRIMARY KEY, val TEXT NOT NULL)', [])
    for (let id = 1; id <= baseline; id += 1) {
      await sql.run('INSERT INTO e2e_durability (id, val) VALUES (?, ?)', [id, `v-${id}`])
    }
  }, BASELINE_ROWS)

  // Fire the burst WITHOUT awaiting it — sequentially chained so the worker
  // queue sees a strictly ordered stream — then reload while it is in flight.
  await page.evaluate(
    ([from, to]) => {
      const sql = window.__sqlite!
      let chain: Promise<unknown> = Promise.resolve()
      for (let id = from; id <= to; id += 1) {
        chain = chain.then(() =>
          sql.run('INSERT INTO e2e_durability (id, val) VALUES (?, ?)', [id, `v-${id}`])
        )
      }
      void chain.catch(() => {
        /* the reload will kill the tail of the chain — expected */
      })
    },
    [BASELINE_ROWS + 1, TOTAL_ROWS]
  )
  await page.waitForTimeout(120) // let part of the burst commit
  await page.reload()
  await page.waitForFunction(() => window.__sqliteReady === true || Boolean(window.__sqliteError), {
    timeout: 60_000
  })

  const after = await page.evaluate(async () => {
    const sql = window.__sqlite!
    const integrity = (await sql.query('PRAGMA integrity_check', [])) as Array<{
      integrity_check: string
    }>
    const rows = (await sql.query('SELECT id, val FROM e2e_durability ORDER BY id', [])) as Array<{
      id: number
      val: string
    }>
    return { integrity: integrity[0]?.integrity_check, rows, mode: await sql.mode() }
  })

  expect(after.mode).toBe('opfs')
  expect(after.integrity).toBe('ok')
  // No committed data lost…
  expect(after.rows.length).toBeGreaterThanOrEqual(BASELINE_ROWS)
  // …and the surviving burst prefix is gap-free and un-torn.
  after.rows.forEach((row, index) => {
    expect(row.id).toBe(index + 1)
    expect(row.val).toBe(`v-${row.id}`)
  })

  // Deterministic replay converges to the full intended state.
  const finalCount = await page.evaluate(async (total) => {
    const sql = window.__sqlite!
    for (let id = 1; id <= total; id += 1) {
      await sql.run('INSERT OR REPLACE INTO e2e_durability (id, val) VALUES (?, ?)', [
        id,
        `v-${id}`
      ])
    }
    const rows = (await sql.query('SELECT COUNT(*) AS n FROM e2e_durability', [])) as Array<{
      n: number
    }>
    return rows[0]?.n
  }, TOTAL_ROWS)
  expect(finalCount).toBe(TOTAL_ROWS)

  await context.close()
})
