/**
 * DataWorker - Web Worker entry for off-main-thread data operations
 *
 * Exposes the DataWorker host (NodeStore, query subscriptions, Y.Doc pool,
 * signing) via Comlink. WorkerBridge talks to this from the main thread.
 *
 * The host class lives in `data-worker-host.ts` so it can be instantiated
 * directly in tests; this entry only wires it to the worker scope.
 *
 * Performance notes:
 * - Comlink transfer() is used for zero-copy ArrayBuffer transfers
 * - Query invalidation runs the 0163 bounded-delta machinery off-thread
 */

import { expose } from 'comlink'
import { DataWorker } from './data-worker-host'

// ─── Expose Worker API ───────────────────────────────────────────────────────

expose(new DataWorker())

export { DataWorker }
