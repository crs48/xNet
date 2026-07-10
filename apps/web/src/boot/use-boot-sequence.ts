/**
 * Web boot sequence — the storage-init effect (SQLite adapter, blob services,
 * worker-vs-main runtime port, cold-start probe, identity resume/unlock) plus
 * the boot watchdog, extracted from App.tsx. Owns the boot AppState, the
 * storage refs, and the trace collector; App.tsx composes this hook and
 * renders per state.
 */
import type { AppState, StorageContext } from './boot-machine'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import type { TraceCollector } from '@xnetjs/telemetry'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { SQLiteNodeStorageAdapter, BlobService } from '@xnetjs/data'
import {
  checkBrowserSupport,
  checkPersistentStorage,
  isSilentPersistRequestSafe,
  isSQLiteCorruptionError,
  recordMemoryFallbackSession,
  requestPersistentStorage,
  SCHEMA_VERSION,
  SCHEMA_DDL
} from '@xnetjs/sqlite'
import { SQLiteStorageAdapter, BlobStore, ChunkManager } from '@xnetjs/storage'
import { useState, useEffect, useRef } from 'react'
import { reportBootFailure } from '../lib/boot-diagnostics'
import { bootMark, isBootDebugEnabled, runWhenBootSettled } from '../lib/boot-timeline'
import {
  clearXNetBrowserStorage,
  clearXNetBrowserStorageResetRequest,
  shouldResetXNetBrowserStorageOnLoad
} from '../lib/browser-storage-reset'
import { scheduleChangeLogCompaction } from '../lib/change-log-compaction'
import { getDataRuntime, isWorkerRuntimeEnabled } from '../lib/data-runtime'
import { schedulePeriodicOptimize } from '../lib/db-optimize'
import { scheduleOneTimeVacuum } from '../lib/db-vacuum'
import { resolveHubSessionFromLocation } from './hub-session'
import { identityManager } from '../lib/identity'
import { startMainThreadStallDetector } from '../lib/main-thread-stall'
import { scheduleStalePresenceCleanup } from '../lib/presence-blob-cleanup'
import { logStoreContents } from '../lib/read-path-probe'
import { startRuntimeLatencyTelemetry } from '../lib/runtime-latency-telemetry'
import { recordDurabilityTransition } from '../lib/storage-durability'
import { looksEvicted, probeStoreColdStart, recordColdStartProbe } from '../lib/store-cold-start'
import { createWebTraceCollector } from '../lib/tracing'
import { BOOT_TIMEOUT_MS } from './boot-machine'

// Hub/session URL resolution lives in ./hub-session (extracted so it's
// testable without this module's SQLite worker imports — 0290 follow-up).
export { resolveHubSessionFromLocation }

/**
 * With the worker runtime enabled, hand the data worker its own port into
 * the SQLite worker so storage calls skip the main thread.
 */
async function createDataWorkerStoragePort(sqliteAdapter: {
  createMessagePort(): Promise<MessagePort>
}): Promise<MessagePort | undefined> {
  if (!isWorkerRuntimeEnabled()) return undefined
  return sqliteAdapter.createMessagePort()
}

export interface BootSequence {
  appState: AppState
  setAppState: Dispatch<SetStateAction<AppState>>
  storageRef: MutableRefObject<StorageContext | null>
  traceCollector: TraceCollector | undefined
  hubUrl: string
  authToken: string | null
}

export function useBootSequence(): BootSequence {
  const [appState, setAppState] = useState<AppState>({ status: 'initializing' })
  const [{ hubUrl, authToken }] = useState(() => resolveHubSessionFromLocation())
  const storageRef = useRef<StorageContext | null>(null)
  // Opt-in performance tracing (exploration 0190): one collector shared by the
  // hooks (config.tracing) and the devtools Traces panel. Off unless the user
  // sets localStorage['xnet:trace'] = '1', so the hot path pays nothing.
  const traceRef = useRef<{ collector?: TraceCollector } | null>(null)
  if (traceRef.current === null) traceRef.current = { collector: createWebTraceCollector() }
  const traceCollector = traceRef.current.collector

  // Initialize SQLite and storage on mount
  useEffect(() => {
    let cancelled = false
    let cleanupAdapter: SQLiteAdapter | null = null
    let cleanupStorageAdapter: SQLiteStorageAdapter | null = null

    async function initialize() {
      try {
        bootMark('init:start')
        // Watch for a main-thread freeze (the ~18s cold-open stall lives in a
        // post-hub:connected event-loop block no per-op timer can see; 0253).
        startMainThreadStallDetector()
        // Input-latency telemetry per data runtime (exploration 0264): the
        // measurement the worker-runtime default flip waits on. Compare via
        // the `[xNet] runtime input latency` boot log across sessions.
        startRuntimeLatencyTelemetry(getDataRuntime())
        if (shouldResetXNetBrowserStorageOnLoad()) {
          clearXNetBrowserStorageResetRequest()
          await clearXNetBrowserStorage()
        }

        // Check browser support first
        const support = await checkBrowserSupport()

        if (!support.supported) {
          if (cancelled) return
          setAppState({ status: 'unsupported', reason: support.reason || 'Browser not supported' })
          return
        }

        const storageWarning = support.warning
        // Chromium/WebKit decide persist() silently and re-evaluate it on
        // every call, so requesting at startup is free — returning users
        // flip to granted once engagement/install/notification signals
        // land. Firefox would show a modal prompt here, so it stays
        // read-only until the user clicks the banner action (0172).
        const storageStatus = isSilentPersistRequestSafe()
          ? await requestPersistentStorage()
          : await checkPersistentStorage()
        recordDurabilityTransition('startup', storageStatus)

        // Dynamically import the web proxy to enable code splitting
        const { WebSQLiteProxy } = await import('@xnetjs/sqlite/web-proxy')

        // Create and open SQLite adapter
        const sqliteAdapter = new WebSQLiteProxy()
        cleanupAdapter = sqliteAdapter

        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        // bootDebug lets the worker emit per-op queue/exec timing + DB stats
        // (exploration 0229) — workers can't read the xnet:boot:debug flag.
        await sqliteAdapter.open({ path: '/xnet.db', bootDebug: isBootDebugEnabled() })
        bootMark('sqlite:open')

        // Memory-fallback telemetry (exploration 0263): multi-tab leadership
        // routing should make non-durable sessions ~zero; count the ones that
        // still happen so the win is measurable across sessions.
        void sqliteAdapter
          .getStorageMode()
          .then((mode) => {
            if (mode === 'memory') {
              const count = recordMemoryFallbackSession()
              console.warn('[xNet] sqlite memory-fallback session', {
                count,
                role: sqliteAdapter.getTabRole()
              })
            }
          })
          .catch(() => {})

        // Graceful leadership handoff (0263): on a real page unload, close the
        // worker so its OPFS handles release deterministically and the next
        // tab promotes without waiting out the handle-contention backoff.
        // `persisted` guards bfcache — a restorable page must keep its DB.
        window.addEventListener('pagehide', (event: PageTransitionEvent) => {
          if (event.persisted) return
          void sqliteAdapter.close().catch(() => {})
        })

        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        // Apply schema
        await sqliteAdapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL)
        bootMark('sqlite:schema')

        // Probe whether the local cache is cold/evicted so views can show a
        // "restoring from hub" affordance instead of a blank screen, and so a
        // silent OPFS eviction is diagnosable (exploration 0204).
        //
        // F1 (exploration 0249): do NOT await this. The probe is a cold
        // `SELECT COUNT(*) FROM nodes` — the first read on the cold OPFS DB — and
        // awaiting it serialized it ahead of identity/store/connect for nothing
        // but a UI affordance with a safe default. Fire-and-forget; the affordance
        // is now reactive (`useRestoringFromHub` subscribes), so it still appears
        // when the probe resolves. The `sqlite:probe` mark fires immediately, so
        // the boot timeline's `probe` segment ≈ 0 — proving the cold read is no
        // longer on the critical path.
        bootMark('sqlite:probe')
        void probeStoreColdStart(sqliteAdapter, storageStatus.persisted, Boolean(hubUrl)).then(
          (coldStart) => {
            recordColdStartProbe(coldStart)
            if (looksEvicted(coldStart)) {
              console.warn(
                '[xNet] Local cache is empty and this origin is not persisted — the ' +
                  'browser may have evicted it. Re-syncing from the hub; enable persistent ' +
                  'storage to keep data across sessions.'
              )
            }
          }
        )

        // Read-path diagnostic (exploration 0212): when boot debug is on, log
        // the durable count matrix (nodes / changes / cursors) so the next
        // capture can tell a populated-but-slow read path apart from a genuinely
        // empty cache. Fire-and-forget — never blocks boot, never throws.
        void logStoreContents(sqliteAdapter)

        // One-time, idle-scheduled cleanup of the stale pre-0227 presence blob
        // that still bloats the OPFS DB file (exploration 0229). No-ops after
        // the first run; the heavy VACUUM never touches the boot critical path.
        scheduleStalePresenceCleanup(sqliteAdapter)

        // One-time, idle-scheduled VACUUM that defragments the OPFS file so the
        // first cold landing query faults a smaller, denser working set — the
        // ~15.8 s cold-read stall caught in exploration 0233. No-ops after the
        // first run; logs file size before/after (the `db stats` measurement).
        scheduleOneTimeVacuum(sqliteAdapter)
        schedulePeriodicOptimize(sqliteAdapter)

        // Adaptive indexes + property-sort pushdown (exploration 0264, Wave 2)
        // soak behind a local flag before any default flip; index creation
        // rides the bootSettled idle cadence — no background work is free on
        // the single serial SQLite worker (0260).
        let adaptiveIndexingEnabled = false
        try {
          adaptiveIndexingEnabled = localStorage.getItem('xnet:adaptive-indexes') === 'true'
        } catch {
          // localStorage unavailable — keep the default off.
        }
        const nodeStorage = new SQLiteNodeStorageAdapter(sqliteAdapter, {
          adaptiveIndexing: { enabled: adaptiveIndexingEnabled },
          scheduleMaintenance: (task) => runWhenBootSettled(() => void task())
        })

        // Idle-scheduled change-log compaction (exploration 0254 / F3): prune
        // superseded history from the local `changes` log so the OPFS file — and
        // the first outbound-resync slice — shrink at the root, the durable fix
        // for the recurring cold-open stall. Convergence-safe (keeps every
        // live-value backer + per-node tips) and behind the
        // `xnet:compact:changes=off` kill switch.
        scheduleChangeLogCompaction(nodeStorage, sqliteAdapter)

        const storageAdapter = new SQLiteStorageAdapter(sqliteAdapter)
        await storageAdapter.open()
        // Boot-phase split (0249): storage adapter is open; what follows up to
        // identity:ready is blob services + the data-worker port + identity.
        bootMark('storage:open')
        cleanupStorageAdapter = storageAdapter

        const blobStore = new BlobStore(storageAdapter)
        const chunkManager = new ChunkManager(blobStore)
        const blobService = new BlobService(chunkManager)

        if (cancelled) {
          await storageAdapter.close()
          await sqliteAdapter.close()
          return
        }

        const dataWorkerStoragePort = await createDataWorkerStoragePort(sqliteAdapter)

        // Store refs for later use
        storageRef.current = {
          sqliteAdapter,
          nodeStorage,
          storageAdapter,
          blobStore,
          blobService,
          dataWorkerStoragePort
        }

        // Check for existing identity
        const hasIdentity = await identityManager.hasIdentity()
        // Boot-phase split (0249): everything after this mark up to
        // identity:ready is the session unlock/resume crypto — so a slow
        // `identityResume` segment isolates a KDF/unwrap cost from storage I/O.
        bootMark('identity:checked')
        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        if (hasIdentity) {
          // A persisted session from a previous unlock lets us skip the
          // biometric prompt across reloads.
          const resumed = await identityManager.resume().catch(() => null)
          if (cancelled) return

          if (resumed) {
            bootMark('identity:ready')
            setAppState({
              status: 'authenticated',
              identity: resumed.identity,
              keyBundle: resumed,
              storageWarning,
              storageStatus
            })
            return
          }

          setAppState({ status: 'unlocking', storageWarning, storageStatus })
          try {
            const keyBundle = await identityManager.unlock()
            if (cancelled) return
            bootMark('identity:ready')
            setAppState({
              status: 'authenticated',
              identity: keyBundle.identity,
              keyBundle,
              storageWarning,
              storageStatus
            })
          } catch (_err) {
            if (cancelled) return
            setAppState({ status: 'needs-onboarding', storageWarning, storageStatus })
          }
        } else {
          setAppState({ status: 'needs-onboarding', storageWarning, storageStatus })
        }
      } catch (err) {
        if (cancelled) return
        await cleanupStorageAdapter?.close().catch(console.error)
        await cleanupAdapter?.close().catch(console.error)
        cleanupStorageAdapter = null
        cleanupAdapter = null

        console.error('[App] Initialization failed:', err)
        const error = err instanceof Error ? err : new Error(String(err))
        // Report with the furthest boot phase reached so a field failure is
        // diagnosable instead of a silent blank/error screen (exploration 0210).
        reportBootFailure('init', error)
        if (isSQLiteCorruptionError(error)) {
          setAppState({ status: 'storage-corrupt', error })
          return
        }

        setAppState({
          status: 'error',
          error
        })
      }
    }

    initialize()

    return () => {
      cancelled = true
      // Cleanup: close adapter immediately to prevent OPFS access handle conflicts
      if (cleanupStorageAdapter) {
        cleanupStorageAdapter.close().catch(console.error)
      }

      if (cleanupAdapter) {
        cleanupAdapter.close().catch(console.error)
      } else if (storageRef.current?.sqliteAdapter) {
        storageRef.current.sqliteAdapter.close().catch(console.error)
      }
    }
    // hubUrl is resolved once from a useState initializer and never re-set, so
    // this still runs a single time; it's listed to satisfy exhaustive-deps now
    // that the cold-start probe reads it (exploration 0204).
  }, [hubUrl])

  // Boot watchdog (exploration 0210): a hung boot — SQLite WASM that never
  // resolves, an OPFS handle that blocks, a hub socket that connects but never
  // acks — throws nothing, so the init try/catch can't see it and the user is
  // stuck on the "Initializing database…" spinner forever. If we're still
  // initializing after the timeout, surface an actionable screen and report it.
  useEffect(() => {
    if (appState.status !== 'initializing') return
    const timer = window.setTimeout(() => {
      const failure = reportBootFailure(
        'timeout',
        new Error(`Boot did not complete within ${BOOT_TIMEOUT_MS / 1000}s`)
      )
      setAppState({ status: 'boot-timeout', failure })
    }, BOOT_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [appState.status])

  return { appState, setAppState, storageRef, traceCollector, hubUrl, authToken }
}
