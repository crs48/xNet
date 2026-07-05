/**
 * xNet Web - Main App Component
 *
 * Handles SQLite initialization, onboarding flow, and identity management.
 * Uses SQLite with OPFS for persistent local-first storage.
 */
import type { NodeStorageAdapter } from '@xnetjs/data'
import type { Identity, KeyBundle } from '@xnetjs/identity'
import type { PersistentStorageStatus, SQLiteAdapter } from '@xnetjs/sqlite'
import type { TraceCollector } from '@xnetjs/telemetry'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { SQLiteNodeStorageAdapter, BlobService } from '@xnetjs/data'
import { getDefaultDataWorkerUrl } from '@xnetjs/data-bridge'
import { XNetDevToolsProvider } from '@xnetjs/devtools'
import { BlobProvider } from '@xnetjs/editor/react'
import {
  XNetProvider,
  OnboardingProvider,
  OnboardingFlow,
  ErrorBoundary,
  OfflineIndicator,
  type XNetRuntimeConfig
} from '@xnetjs/react'
import {
  checkBrowserSupport,
  checkPersistentStorage,
  isSilentPersistRequestSafe,
  isSQLiteCorruptionError,
  recordMemoryFallbackSession,
  requestPersistentStorage,
  showUnsupportedBrowserMessage,
  watchPersistentStoragePermission,
  SCHEMA_VERSION,
  SCHEMA_DDL
} from '@xnetjs/sqlite'
import { SQLiteStorageAdapter, BlobStore, ChunkManager } from '@xnetjs/storage'
import { ThemeProvider } from '@xnetjs/ui'
import { useState, useCallback, useEffect, useRef } from 'react'
import { BootTimelineProbe } from './components/BootTimelineProbe'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { ConsentBanner } from './components/ConsentBanner'
import { StorageWarningBanner } from './components/StorageWarningBanner'
import { WorkingSetPrewarm } from './components/WorkingSetPrewarm'
import { type BootFailure, reportBootFailure } from './lib/boot-diagnostics'
import { bootMark, isBootDebugEnabled, runWhenBootSettled } from './lib/boot-timeline'
import {
  clearXNetBrowserStorage,
  clearXNetBrowserStorageResetRequest,
  requestXNetBrowserStorageReset,
  shouldResetXNetBrowserStorageOnLoad,
  subscribeXNetStorageCorruption
} from './lib/browser-storage-reset'
import { scheduleChangeLogCompaction } from './lib/change-log-compaction'
import { isWorkerRuntimeEnabled } from './lib/data-runtime'
import { schedulePeriodicOptimize } from './lib/db-optimize'
import { scheduleOneTimeVacuum } from './lib/db-vacuum'
import { defaultHubUrl, persistedHubUrl, readHubParam, setPersistedHubUrl } from './lib/hub-url'
import { identityManager } from './lib/identity'
import { startMainThreadStallDetector } from './lib/main-thread-stall'
import { scheduleStalePresenceCleanup } from './lib/presence-blob-cleanup'
import { logStoreContents } from './lib/read-path-probe'
import { detectBrowserFamily, getStorageBanner } from './lib/storage-banner'
import { recordDurabilityTransition, subscribeStorageStatus } from './lib/storage-durability'
import { looksEvicted, probeStoreColdStart, recordColdStartProbe } from './lib/store-cold-start'
import { createWebTraceCollector } from './lib/tracing'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

// ─── Router ─────────────────────────────────────────────────────
const useHashRouter = import.meta.env.VITE_USE_HASH_ROUTER === 'true'
const basePath = import.meta.env.BASE_URL || '/'
const router = createRouter({
  routeTree,
  ...(useHashRouter ? { history: createHashHistory() } : { basepath: basePath })
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Hub URL from env or default.
//
// In development an unset VITE_HUB_URL means "no hub" (empty string) rather than
// the production hub: dialing wss://hub.xnet.fyi by accident makes the socket
// reach `connected` against a server that won't ack this client's document
// subscriptions, which used to stall page loads (exploration 0188) and also
// leaked dev presence to production. A falsy hub URL keeps the app local-first;
// opt into a real hub by setting VITE_HUB_URL (e.g. ws://localhost:4444).
const DEFAULT_HUB_URL = defaultHubUrl()

// A hub the user connected via Settings or the xNet Cloud claim flow (persisted in
// localStorage) wins over the build-time default — this is the read half of that
// setting, without which "connect your cloud hub" did nothing (exploration 0192).
const resolveConfiguredHubUrl = (): string => persistedHubUrl(DEFAULT_HUB_URL)

if (typeof console !== 'undefined') {
  console.info(
    '[xNet] hub:',
    resolveConfiguredHubUrl() || '(none — local-first; set a hub in Settings or VITE_HUB_URL)'
  )
}

type SharedHubSession = {
  endpoint: string
  token: string
  exp: number
}

type BeforeInstallPromptUserChoice = {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<BeforeInstallPromptUserChoice>
}

function resolveHubSessionFromLocation(): { hubUrl: string; authToken: string | null } {
  try {
    const parsed = new URL(window.location.href)
    // Under hash routing the route query lives inside the fragment
    // (e.g. /app/#/doc/x?shareSession=k) — check both locations.
    const [hashPath, hashQuery = ''] = parsed.hash.split('?')
    const hashParams = new URLSearchParams(hashQuery)
    const shareSession = parsed.searchParams.get('shareSession') ?? hashParams.get('shareSession')

    const stripParams = (...names: string[]): void => {
      for (const name of names) {
        parsed.searchParams.delete(name)
        hashParams.delete(name)
      }
      const hash = hashParams.size > 0 ? `${hashPath}?${hashParams.toString()}` : hashPath
      window.history.replaceState({}, '', `${parsed.pathname}${parsed.search}${hash}`)
    }

    if (
      parsed.searchParams.has('payload') ||
      parsed.searchParams.has('handle') ||
      hashParams.has('payload') ||
      hashParams.has('handle')
    ) {
      stripParams('payload', 'handle')
    }
    // A `hub` param pins a hub for this browser — the xNet Cloud dashboard's "Open
    // web app" link passes the user's *personal* hub here so the app dials it
    // instead of the shared default. Persist it (so it sticks across reloads) and
    // strip it from the URL; an invalid value is ignored, never persisted.
    const hubParam = readHubParam(parsed.search, parsed.hash)
    if (hubParam.present) {
      if (hubParam.hub) setPersistedHubUrl(hubParam.hub)
      stripParams('hub')
    }
    if (!shareSession) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }

    const stored = sessionStorage.getItem(`xnet:share-session:${shareSession}`)
    stripParams('shareSession')
    if (!stored) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }

    sessionStorage.removeItem(`xnet:share-session:${shareSession}`)
    const session = JSON.parse(stored) as SharedHubSession
    if (
      !session ||
      typeof session.endpoint !== 'string' ||
      typeof session.token !== 'string' ||
      session.endpoint.length === 0 ||
      session.token.length === 0 ||
      !Number.isFinite(session.exp) ||
      session.exp <= Date.now()
    ) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }

    return { hubUrl: session.endpoint, authToken: session.token }
  } catch {
    return { hubUrl: DEFAULT_HUB_URL, authToken: null }
  }
}

function isStandaloneWebApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function useWebInstallPrompt(): {
  canInstall: boolean
  isInstalled: boolean
  promptInstall: () => Promise<BeforeInstallPromptUserChoice | null>
} {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneWebApp())

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)')
    const handleDisplayModeChange = () => setIsInstalled(isStandaloneWebApp())

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<BeforeInstallPromptUserChoice | null> => {
    if (!installPrompt) {
      return null
    }

    const prompt = installPrompt
    setInstallPrompt(null)
    await prompt.prompt()
    const userChoice = await prompt.userChoice.catch(() => null)

    if (userChoice?.outcome === 'accepted') {
      setIsInstalled(true)
    }

    return userChoice
  }, [installPrompt])

  return {
    canInstall: Boolean(installPrompt),
    isInstalled,
    promptInstall
  }
}

// Cold start can legitimately take 10–20s on a slow first load (SQLite WASM
// download + OPFS), so the watchdog waits past that before declaring a hang
// (exploration 0210). A late success still replaces the timeout screen.
const BOOT_TIMEOUT_MS = 25_000

// ─── Types ──────────────────────────────────────────────────────
type AppState =
  | { status: 'initializing' }
  | { status: 'unsupported'; reason: string }
  | { status: 'loading' }
  | { status: 'needs-onboarding'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'unlocking'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'storage-corrupt'; error: Error }
  | { status: 'boot-timeout'; failure: BootFailure }
  | {
      status: 'authenticated'
      identity: Identity
      keyBundle: KeyBundle
      storageWarning?: string
      storageStatus?: PersistentStorageStatus
    }
  | { status: 'error'; error: Error }

// ─── Storage Context ────────────────────────────────────────────
interface StorageContext {
  sqliteAdapter: SQLiteAdapter
  nodeStorage: NodeStorageAdapter
  storageAdapter: SQLiteStorageAdapter
  blobStore: BlobStore
  blobService: BlobService
  /** SQLite worker port for the data worker (worker runtime flag only) */
  dataWorkerStoragePort?: MessagePort
}

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

function resolveWebRuntime(storage: StorageContext): XNetRuntimeConfig {
  if (isWorkerRuntimeEnabled()) {
    return {
      mode: 'worker',
      fallback: 'main-thread',
      diagnostics: import.meta.env.DEV,
      worker: {
        url: getDefaultDataWorkerUrl(),
        storagePort: storage.dataWorkerStoragePort
      }
    }
  }
  return {
    mode: 'main-thread',
    fallback: 'main-thread',
    diagnostics: import.meta.env.DEV
  }
}

function updateAppStorageStatus(
  current: AppState,
  storageStatus: PersistentStorageStatus
): AppState {
  switch (current.status) {
    case 'needs-onboarding':
    case 'unlocking':
    case 'authenticated':
      return { ...current, storageStatus }
    default:
      return current
  }
}

// ─── Unsupported Browser Component ──────────────────────────────
function UnsupportedBrowser({ reason }: { reason: string }): JSX.Element {
  useEffect(() => {
    showUnsupportedBrowserMessage(reason)
  }, [reason])
  return <div id="app" />
}

// ─── Main App ───────────────────────────────────────────────────
export function App(): JSX.Element {
  const [appState, setAppState] = useState<AppState>({ status: 'initializing' })
  const [isRequestingStorage, setIsRequestingStorage] = useState(false)
  const [isInstallingApp, setIsInstallingApp] = useState(false)
  const [isResettingStorage, setIsResettingStorage] = useState(false)
  const [browserFamily] = useState(() => detectBrowserFamily())
  const {
    canInstall: canInstallApp,
    isInstalled: isInstalledApp,
    promptInstall
  } = useWebInstallPrompt()
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

  // A persistent-storage grant can land mid-session (notification opt-in,
  // install, engagement crossing Chrome's threshold). Watching the
  // permission is free — it never spends or triggers a request (0172).
  useEffect(() => {
    return watchPersistentStoragePermission((state) => {
      if (state !== 'granted') return
      void checkPersistentStorage().then((storageStatus) => {
        recordDurabilityTransition('permission-change', storageStatus)
        setAppState((current) => updateAppStorageStatus(current, storageStatus))
      })
    })
  }, [])

  // Statuses produced outside App's own handlers (the desktop-alerts
  // opt-in chains a persist() request after a notification grant).
  useEffect(() => {
    return subscribeStorageStatus((storageStatus) => {
      setAppState((current) => updateAppStorageStatus(current, storageStatus))
    })
  }, [])

  useEffect(() => {
    return subscribeXNetStorageCorruption((error) => {
      const storage = storageRef.current
      storageRef.current = null

      void storage?.storageAdapter.close().catch(console.error)
      void storage?.sqliteAdapter.close().catch(console.error)

      setAppState({ status: 'storage-corrupt', error })
    })
  }, [])

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback((identity: Identity, keyBundle: KeyBundle) => {
    setAppState((current) => ({
      status: 'authenticated',
      identity,
      keyBundle,
      storageWarning: 'storageWarning' in current ? current.storageWarning : undefined,
      storageStatus: 'storageStatus' in current ? current.storageStatus : undefined
    }))
  }, [])

  const handleRequestPersistentStorage = useCallback(async () => {
    setIsRequestingStorage(true)

    try {
      const storageStatus = await requestPersistentStorage()
      recordDurabilityTransition('banner', storageStatus)
      setAppState((current) => updateAppStorageStatus(current, storageStatus))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAppState((current) =>
        updateAppStorageStatus(current, {
          supported: true,
          persisted: null,
          granted: null,
          requested: true,
          requestable: true,
          state: 'error',
          message: `xNet could not confirm durable storage (${message}). Local data may still work, but persistence guarantees are unclear.`
        })
      )
    } finally {
      setIsRequestingStorage(false)
    }
  }, [])

  const handleInstallApp = useCallback(async () => {
    setIsInstallingApp(true)

    try {
      const userChoice = await promptInstall()

      if (userChoice?.outcome === 'accepted') {
        // Installing makes the grant available but the browser does not
        // flip persisted() on its own — request, don't just check (0172).
        const storageStatus = await requestPersistentStorage()
        recordDurabilityTransition('install', storageStatus)
        setAppState((current) => updateAppStorageStatus(current, storageStatus))
      }
    } finally {
      setIsInstallingApp(false)
    }
  }, [promptInstall])

  const handleResetCorruptStorage = useCallback(async () => {
    setIsResettingStorage(true)

    try {
      await clearXNetBrowserStorage()
      window.location.reload()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[App] Failed to reset corrupt storage:', error)
      setAppState({ status: 'error', error })
    } finally {
      setIsResettingStorage(false)
    }
  }, [])

  // ─── Render ─────────────────────────────────────────────────────

  // Initializing SQLite state
  if (appState.status === 'initializing') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Initializing database...</p>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Unsupported browser state
  if (appState.status === 'unsupported') {
    return <UnsupportedBrowser reason={appState.reason} />
  }

  // Loading state
  if (appState.status === 'loading') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Unlocking state (Touch ID prompt)
  if (appState.status === 'unlocking') {
    const storageBanner = getStorageBanner({
      ...appState,
      browserFamily,
      installAvailable: canInstallApp,
      isInstalled: isInstalledApp
    })
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        {storageBanner && (
          <StorageWarningBanner
            {...storageBanner}
            actionPending={isRequestingStorage}
            onAction={storageBanner.actionLabel ? handleRequestPersistentStorage : undefined}
            secondaryActionPending={isInstallingApp}
            onSecondaryAction={storageBanner.secondaryActionLabel ? handleInstallApp : undefined}
          />
        )}
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <div className="text-4xl mb-4">🔐</div>
            <h1 className="text-xl font-semibold mb-2">Welcome back</h1>
            <p className="text-muted-foreground">Authenticate to continue...</p>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Error state
  if (appState.status === 'error') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold mb-2 text-destructive">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">{appState.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Boot watchdog fired — boot never finished (exploration 0210). Show the
  // furthest stage reached and offer recovery instead of an endless spinner.
  if (appState.status === 'boot-timeout') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">⏳</div>
            <h1 className="text-xl font-semibold mb-2">xNet is taking too long to start</h1>
            <p className="text-muted-foreground mb-2">
              The app didn't finish loading. This usually clears up on a reload; if it keeps
              happening, resetting local data starts you fresh.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Stalled at: <span className="font-mono">{appState.failure.stage}</span>
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Reload
              </button>
              <button
                onClick={handleResetCorruptStorage}
                disabled={isResettingStorage}
                className="px-4 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-60"
              >
                {isResettingStorage ? 'Resetting…' : 'Reset local data'}
              </button>
            </div>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  if (appState.status === 'storage-corrupt') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="max-w-lg p-6 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold mb-2 text-destructive">
              Local database needs recovery
            </h1>
            <p className="text-muted-foreground mb-4">
              SQLite reported a malformed local database. Resetting removes local xNet data in this
              browser and creates a fresh database.
            </p>
            <p className="text-xs text-muted-foreground mb-6 break-words">
              {appState.error.message}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={handleResetCorruptStorage}
                disabled={isResettingStorage}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-60"
              >
                {isResettingStorage ? 'Resetting...' : 'Reset local database'}
              </button>
              <button
                onClick={() => window.location.reload()}
                disabled={isResettingStorage}
                className="px-4 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-60"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Onboarding flow
  if (appState.status === 'needs-onboarding') {
    const storageBanner = getStorageBanner({
      ...appState,
      browserFamily,
      installAvailable: canInstallApp,
      isInstalled: isInstalledApp
    })
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        {storageBanner && (
          <StorageWarningBanner
            {...storageBanner}
            actionPending={isRequestingStorage}
            onAction={storageBanner.actionLabel ? handleRequestPersistentStorage : undefined}
            secondaryActionPending={isInstallingApp}
            onSecondaryAction={storageBanner.secondaryActionLabel ? handleInstallApp : undefined}
          />
        )}
        <OnboardingProvider defaultHubUrl={hubUrl} onComplete={handleOnboardingComplete}>
          <OnboardingFlow />
        </OnboardingProvider>
      </ThemeProvider>
    )
  }

  // Authenticated — render main app
  const { identity, keyBundle } = appState
  const storageBanner = getStorageBanner({
    ...appState,
    browserFamily,
    installAvailable: canInstallApp,
    isInstalled: isInstalledApp
  })
  const storage = storageRef.current!

  return (
    <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
      {storageBanner && (
        <StorageWarningBanner
          {...storageBanner}
          actionPending={isRequestingStorage}
          onAction={storageBanner.actionLabel ? handleRequestPersistentStorage : undefined}
          secondaryActionPending={isInstallingApp}
          onSecondaryAction={storageBanner.secondaryActionLabel ? handleInstallApp : undefined}
        />
      )}
      <ConsentBanner />
      <ErrorBoundary>
        <XNetProvider
          config={{
            nodeStorage: storage.nodeStorage,
            authorDID: identity.did as `did:key:${string}`,
            signingKey: keyBundle.signingKey,
            blobStore: storage.blobStore,
            hubUrl,
            hubOptions: authToken ? { autoAuth: false, authToken } : undefined,
            runtime: resolveWebRuntime(storage),
            platform: 'web',
            tracing: traceCollector
          }}
        >
          <BootTimelineProbe />
          <WorkingSetPrewarm />
          <BundledPluginInstaller />
          <XNetDevToolsProvider
            position="bottom"
            defaultOpen={false}
            storageDurability={appState.storageStatus ?? null}
            traceCollector={traceCollector}
            onResetLocalData={requestXNetBrowserStorageReset}
          >
            <BlobProvider blobService={storage.blobService}>
              <OfflineIndicator />
              <RouterProvider router={router} />
            </BlobProvider>
          </XNetDevToolsProvider>
        </XNetProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
