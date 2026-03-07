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
import { XNetDevToolsProvider } from '@xnetjs/devtools'
import { BlobProvider } from '@xnetjs/editor/react'
import { createIdentityManager } from '@xnetjs/identity'
import {
  XNetProvider,
  OnboardingProvider,
  OnboardingFlow,
  ErrorBoundary,
  OfflineIndicator
} from '@xnetjs/react'
import {
  checkBrowserSupport,
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

// ─── Types ──────────────────────────────────────────────────────
type AppState =
  | { status: 'initializing' }
  | { status: 'unsupported'; reason: string }
  | { status: 'loading' }
  | { status: 'needs-onboarding'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'unlocking'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
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
}

type StorageBannerTone = 'success' | 'warning' | 'info'

type StorageBannerDescriptor = {
  tone: StorageBannerTone
  title: string
  message: string
  usageBytes?: number
  quotaBytes?: number
}

function getStorageBanner(input: {
  storageWarning?: string
  storageStatus?: PersistentStorageStatus
}): StorageBannerDescriptor | null {
  const { storageWarning, storageStatus } = input

  if (storageWarning) {
    return {
      tone: storageStatus?.state === 'granted' ? 'info' : 'warning',
      title: 'Storage may be limited',
      message:
        storageStatus && storageStatus.state !== 'granted'
          ? `${storageWarning} ${storageStatus.message}`
          : storageWarning,
      usageBytes: storageStatus?.usageBytes,
      quotaBytes: storageStatus?.quotaBytes
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
        title: 'Durable storage not granted',
        message: storageStatus.message,
        usageBytes: storageStatus.usageBytes,
        quotaBytes: storageStatus.quotaBytes
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
  const [{ hubUrl, authToken }] = useState(() => resolveHubSessionFromLocation())
  const storageRef = useRef<StorageContext | null>(null)

  // Initialize SQLite and storage on mount
  useEffect(() => {
    let cancelled = false
    let cleanupAdapter: SQLiteAdapter | null = null

    async function initialize() {
      try {
        // Check browser support first
        const support = await checkBrowserSupport()

        if (!support.supported) {
          if (cancelled) return
          setAppState({ status: 'unsupported', reason: support.reason || 'Browser not supported' })
          return
        }

        const storageWarning = support.warning
        const storageStatus = await requestPersistentStorage()

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

        const blobStore = new BlobStore(storageAdapter)
        const chunkManager = new ChunkManager(blobStore)
        const blobService = new BlobService(chunkManager)

        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        // Store refs for later use
        storageRef.current = {
          sqliteAdapter,
          nodeStorage,
          storageAdapter,
          blobStore,
          blobService
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
        console.error('[App] Initialization failed:', err)
        setAppState({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err))
        })
      }
    }

    initialize()

    return () => {
      cancelled = true
      // Cleanup: close adapter immediately to prevent OPFS access handle conflicts
      if (cleanupAdapter) {
        cleanupAdapter.close().catch(console.error)
      } else if (storageRef.current?.sqliteAdapter) {
        storageRef.current.sqliteAdapter.close().catch(console.error)
      }
    }
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
    const storageBanner = getStorageBanner(appState)
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        {storageBanner && <StorageWarningBanner {...storageBanner} />}
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

  // Onboarding flow
  if (appState.status === 'needs-onboarding') {
    const storageBanner = getStorageBanner(appState)
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        {storageBanner && <StorageWarningBanner {...storageBanner} />}
        <OnboardingProvider defaultHubUrl={hubUrl} onComplete={handleOnboardingComplete}>
          <OnboardingFlow />
        </OnboardingProvider>
      </ThemeProvider>
    )
  }

  // Authenticated — render main app
  const { identity, keyBundle } = appState
  const storageBanner = getStorageBanner(appState)
  const storage = storageRef.current!

  return (
    <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
      {storageBanner && <StorageWarningBanner {...storageBanner} />}
      <ErrorBoundary>
        <XNetProvider
          config={{
            nodeStorage: storage.nodeStorage,
            authorDID: identity.did as `did:key:${string}`,
            signingKey: keyBundle.signingKey,
            blobStore: storage.blobStore,
            hubUrl,
            hubOptions: authToken ? { autoAuth: false, authToken } : undefined,
            runtime: {
              mode: 'worker',
              fallback: 'main-thread',
              diagnostics: import.meta.env.DEV
            },
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
