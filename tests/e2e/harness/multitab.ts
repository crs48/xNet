/**
 * Multi-tab SQLite harness page (exploration 0263).
 *
 * Boots a WebSQLiteProxy against the BUILT @xnetjs/sqlite dist (the worker
 * files only exist as siblings there) and exposes a tiny window API the
 * Playwright spec drives: role, storage mode, and raw SQL against a scratch
 * table. Two tabs of this page exercise leader election, follower routing,
 * and leader-death promotion against real OPFS.
 */

// eslint-disable-next-line import/no-relative-packages
import { WebSQLiteProxy } from '../../../packages/sqlite/dist/adapters/web-proxy.js'

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

const statusEl = document.getElementById('status')!

async function boot(): Promise<void> {
  try {
    const proxy = new WebSQLiteProxy()
    await proxy.open({ path: '/e2e-multitab.db' })
    await proxy.run(
      'CREATE TABLE IF NOT EXISTS e2e_multitab (id INTEGER PRIMARY KEY, note TEXT)',
      []
    )

    window.__sqlite = {
      role: () => proxy.getTabRole(),
      mode: () => Promise.resolve(proxy.getStorageMode()),
      run: (sql: string, params?: unknown[]) => proxy.run(sql, params as never),
      query: (sql: string, params?: unknown[]) => proxy.query(sql, params as never),
      multiTabSupported:
        typeof navigator.locks !== 'undefined' && typeof SharedWorker === 'function'
    }
    window.__sqliteReady = true
    statusEl.textContent = `ready role=${proxy.getTabRole()}`
  } catch (err) {
    window.__sqliteError = err instanceof Error ? err.message : String(err)
    statusEl.textContent = `error: ${window.__sqliteError}`
  }
}

void boot()
