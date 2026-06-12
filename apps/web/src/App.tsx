/**
 * xNet Web - Main App Component
 *
 * Handles SQLite initialization, onboarding flow, and identity management.
 * Uses SQLite with OPFS for persistent local-first storage.
 */
import type { NodeStorageAdapter } from '@xnetjs/data'
import type { Identity, KeyBundle } from '@xnetjs/identity'
import type { PersistentStorageStatus, SQLiteAdapter } from '@xnetjs/sqlite'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { SQLiteNodeStorageAdapter, BlobService } from '@xnetjs/data'
import { getDefaultDataWorkerUrl } from '@xnetjs/data-bridge'
import { XNetDevToolsProvider } from '@xnetjs/devtools'
import { BlobProvider } from '@xnetjs/editor/react'
import { createIdentityManager } from '@xnetjs/identity'
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
  isSQLiteCorruptionError,
  requestPersistentStorage,
  showUnsupportedBrowserMessage,
  SCHEMA_VERSION,
  SCHEMA_DDL
} from '@xnetjs/sqlite'
import { SQLiteStorageAdapter, BlobStore, ChunkManager } from '@xnetjs/storage'
import { ThemeProvider } from '@xnetjs/ui'
import { useState, useCallback, useEffect, useRef } from 'react'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { StorageWarningBanner } from './components/StorageWarningBanner'
import {
  clearXNetBrowserStorage,
  clearXNetBrowserStorageResetRequest,
  shouldResetXNetBrowserStorageOnLoad,
  subscribeXNetStorageCorruption
} from './lib/browser-storage-reset'
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

// Identity manager (singleton)
const identityManager = createIdentityManager()

// Hub URL from env or default
const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL || 'wss://hub.xnet.fyi'

type SharedHubSession = {
  endpoint: string
  token: string
  exp: number
}

type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other'

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
    const shareSession = parsed.searchParams.get('shareSession')
    if (parsed.searchParams.has('payload') || parsed.searchParams.has('handle')) {
      parsed.searchParams.delete('payload')
      parsed.searchParams.delete('handle')
      window.history.replaceState({}, '', `${parsed.pathname}${parsed.search}${parsed.hash}`)
    }
    if (!shareSession) {
      return { hubUrl: DEFAULT_HUB_URL, authToken: null }
    }

    const stored = sessionStorage.getItem(`xnet:share-session:${shareSession}`)
    parsed.searchParams.delete('shareSession')
    window.history.replaceState({}, '', `${parsed.pathname}${parsed.search}${parsed.hash}`)
    if (!stored) {
      return { hubUrl: DEFAULT_HUB_URL, authToken: null }
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
      return { hubUrl: DEFAULT_HUB_URL, authToken: null }
    }

    return { hubUrl: session.endpoint, authToken: session.token }
  } catch {
    return { hubUrl: DEFAULT_HUB_URL, authToken: null }
  }
}

function detectBrowserFamily(): BrowserFamily {
  if (typeof navigator === 'undefined') {
    return 'other'
  }

  const userAgent = navigator.userAgent
  const isChromium =
    /Chrome|Chromium|Edg|OPR/i.test(userAgent) &&
    !/Firefox|FxiOS|Safari\/.*Version/i.test(userAgent)
  const isFirefox = /Firefox|FxiOS/i.test(userAgent)
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(userAgent)

  if (isChromium) return 'chromium'
  if (isFirefox) return 'firefox'
  if (isSafari) return 'safari'
  return 'other'
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

function getStorageRecoveryItems(input: {
  browserFamily: BrowserFamily
  installAvailable: boolean
  isInstalled: boolean
  storageStatus: PersistentStorageStatus
}): string[] {
  const { browserFamily, installAvailable, isInstalled, storageStatus } = input

  if (storageStatus.state !== 'not-granted') {
    return []
  }

  const common = storageStatus.requested
    ? ['Browsers do not expose an override after they decline this request.']
    : ['Browsers decide durable-storage requests from install and engagement signals.']
  const localhostHint =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? [
          'Localhost can be stricter than a real HTTPS app origin for install and engagement heuristics.'
        ]
      : []

  if (browserFamily === 'safari') {
    return [
      ...common,
      'Safari usually needs xNet installed first. On macOS, use Share > Add to Dock, open xNet from the Dock, then retry.',
      'On iPhone or iPad, use Share > Add to Home Screen, open xNet from the Home Screen, then retry.',
      ...localhostHint
    ]
  }

  if (browserFamily === 'chromium') {
    return [
      ...common,
      installAvailable && !isInstalled
        ? 'Install xNet with the Install app button, open the installed app, then retry durable storage.'
        : 'If install is unavailable, use the browser install icon or bookmark xNet, keep using it, then retry.',
      ...localhostHint
    ]
  }

  if (browserFamily === 'firefox') {
    return [
      ...common,
      'Firefox may show a persistent-storage permission prompt. Allow it if prompted, then retry.',
      ...localhostHint
    ]
  }

  return [
    ...common,
    'Install or bookmark xNet, keep using it from the same browser profile, then retry durable storage.',
    ...localhostHint
  ]
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

// ─── Types ──────────────────────────────────────────────────────
type AppState =
  | { status: 'initializing' }
  | { status: 'unsupported'; reason: string }
  | { status: 'loading' }
  | { status: 'needs-onboarding'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'unlocking'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'storage-corrupt'; error: Error }
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
 * Worker-resident data layer rollout flag (exploration 0164).
 * Enable with `localStorage.setItem('xnet:runtime', 'worker')` and reload;
 * remove the key to return to the main-thread bridge.
 */
function isWorkerRuntimeEnabled(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('xnet:runtime') === 'worker'
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

type StorageBannerTone = 'success' | 'warning' | 'info'

type StorageBannerDescriptor = {
  tone: StorageBannerTone
  title: string
  message: string
  usageBytes?: number
  quotaBytes?: number
  actionLabel?: string
  actionPendingLabel?: string
  secondaryActionLabel?: string
  secondaryActionPendingLabel?: string
  detailItems?: string[]
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

function getStorageBanner(input: {
  storageWarning?: string
  storageStatus?: PersistentStorageStatus
  browserFamily: BrowserFamily
  installAvailable: boolean
  isInstalled: boolean
}): StorageBannerDescriptor | null {
  const { browserFamily, installAvailable, isInstalled, storageWarning, storageStatus } = input
  const detailItems = storageStatus
    ? getStorageRecoveryItems({ browserFamily, installAvailable, isInstalled, storageStatus })
    : []

  if (storageWarning) {
    return {
      tone: storageStatus?.state === 'granted' ? 'info' : 'warning',
      title: 'Storage may be limited',
      message:
        storageStatus && storageStatus.state !== 'granted'
          ? `${storageWarning} ${storageStatus.message}`
          : storageWarning,
      usageBytes: storageStatus?.usageBytes,
      quotaBytes: storageStatus?.quotaBytes,
      ...(storageStatus?.requestable
        ? {
            actionLabel: 'Enable durable storage',
            actionPendingLabel: 'Requesting storage'
          }
        : {}),
      ...(detailItems.length > 0 ? { detailItems } : {}),
      ...(installAvailable && !isInstalled && storageStatus?.state === 'not-granted'
        ? {
            secondaryActionLabel: 'Install app',
            secondaryActionPendingLabel: 'Opening install'
          }
        : {})
    }
  }

  if (!storageStatus) {
    return null
  }

  switch (storageStatus.state) {
    case 'granted':
      return {
        tone: 'success',
        title: 'Durable local storage enabled',
        message: storageStatus.message,
        usageBytes: storageStatus.usageBytes,
        quotaBytes: storageStatus.quotaBytes
      }
    case 'not-granted':
      return {
        tone: 'warning',
        title: storageStatus.requested
          ? 'Browser declined durable storage'
          : 'Enable durable local storage',
        message: storageStatus.message,
        usageBytes: storageStatus.usageBytes,
        quotaBytes: storageStatus.quotaBytes,
        ...(storageStatus.requestable
          ? {
              actionLabel: storageStatus.requested
                ? 'Retry durable storage'
                : 'Enable durable storage',
              actionPendingLabel: 'Requesting storage'
            }
          : {}),
        ...(detailItems.length > 0 ? { detailItems } : {}),
        ...(installAvailable && !isInstalled
          ? {
              secondaryActionLabel: 'Install app',
              secondaryActionPendingLabel: 'Opening install'
            }
          : {})
      }
    case 'unsupported':
    case 'error':
      return {
        tone: 'info',
        title: 'Storage durability unavailable',
        message: storageStatus.message,
        usageBytes: storageStatus.usageBytes,
        quotaBytes: storageStatus.quotaBytes
      }
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

  // Initialize SQLite and storage on mount
  useEffect(() => {
    let cancelled = false
    let cleanupAdapter: SQLiteAdapter | null = null
    let cleanupStorageAdapter: SQLiteStorageAdapter | null = null

    async function initialize() {
      try {
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
        const storageStatus = await checkPersistentStorage()

        // Dynamically import the web proxy to enable code splitting
        const { WebSQLiteProxy } = await import('@xnetjs/sqlite/web-proxy')

        // Create and open SQLite adapter
        const sqliteAdapter = new WebSQLiteProxy()
        cleanupAdapter = sqliteAdapter

        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        await sqliteAdapter.open({ path: '/xnet.db' })

        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        // Apply schema
        await sqliteAdapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL)

        const nodeStorage = new SQLiteNodeStorageAdapter(sqliteAdapter)
        const storageAdapter = new SQLiteStorageAdapter(sqliteAdapter)
        await storageAdapter.open()
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
        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        if (hasIdentity) {
          setAppState({ status: 'unlocking', storageWarning, storageStatus })
          try {
            const keyBundle = await identityManager.unlock()
            if (cancelled) return
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
        const storageStatus = await checkPersistentStorage()
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
            platform: 'web'
          }}
        >
          <BundledPluginInstaller />
          <XNetDevToolsProvider
            position="bottom"
            defaultOpen={false}
            storageDurability={appState.storageStatus ?? null}
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
