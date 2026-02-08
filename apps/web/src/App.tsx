/**
 * xNet Web - Main App Component
 *
 * Handles SQLite initialization, onboarding flow, and identity management.
 * Uses SQLite with OPFS for persistent local-first storage.
 */
import type { NodeStorageAdapter } from '@xnet/data'
import type { Identity, KeyBundle } from '@xnet/identity'
import type { SQLiteAdapter } from '@xnet/sqlite'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { SQLiteNodeStorageAdapter, BlobService } from '@xnet/data'
import { XNetDevToolsProvider } from '@xnet/devtools'
import { BlobProvider } from '@xnet/editor/react'
import { createIdentityManager } from '@xnet/identity'
import {
  XNetProvider,
  OnboardingProvider,
  OnboardingFlow,
  ErrorBoundary,
  OfflineIndicator
} from '@xnet/react'
import {
  checkBrowserSupport,
  showUnsupportedBrowserMessage,
  SCHEMA_VERSION,
  SCHEMA_DDL
} from '@xnet/sqlite'
import { SQLiteStorageAdapter, BlobStore, ChunkManager } from '@xnet/storage'
import { ThemeProvider } from '@xnet/ui'
import { useState, useCallback, useEffect, useRef } from 'react'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

// ─── Router ─────────────────────────────────────────────────────
const useHashRouter = import.meta.env.VITE_USE_HASH_ROUTER === 'true'
const router = createRouter({
  routeTree,
  ...(useHashRouter ? { history: createHashHistory() } : { basepath: '/app' })
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Identity manager (singleton)
const identityManager = createIdentityManager()

// Hub URL from env or default
const HUB_URL = import.meta.env.VITE_HUB_URL || 'wss://hub.xnet.fyi'

// ─── Types ──────────────────────────────────────────────────────
type AppState =
  | { status: 'initializing' }
  | { status: 'unsupported'; reason: string }
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | { status: 'unlocking' }
  | { status: 'authenticated'; identity: Identity; keyBundle: KeyBundle }
  | { status: 'error'; error: Error }

// ─── Storage Context ────────────────────────────────────────────
interface StorageContext {
  sqliteAdapter: SQLiteAdapter
  nodeStorage: NodeStorageAdapter
  storageAdapter: SQLiteStorageAdapter
  blobStore: BlobStore
  blobService: BlobService
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
  const storageRef = useRef<StorageContext | null>(null)

  // Initialize SQLite and storage on mount
  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        // Check browser support first
        const support = await checkBrowserSupport()
        if (!support.supported) {
          if (cancelled) return
          setAppState({ status: 'unsupported', reason: support.reason || 'Browser not supported' })
          return
        }

        // Dynamically import the web proxy to enable code splitting
        const { WebSQLiteProxy } = await import('@xnet/sqlite/web-proxy')

        // Create and open SQLite adapter
        const sqliteAdapter = new WebSQLiteProxy()
        await sqliteAdapter.open({ path: '/xnet.db' })

        // Apply schema
        await sqliteAdapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL)

        // Create storage adapters
        const nodeStorage = new SQLiteNodeStorageAdapter(sqliteAdapter)
        await nodeStorage.open()

        const storageAdapter = new SQLiteStorageAdapter(sqliteAdapter)
        await storageAdapter.open()

        const blobStore = new BlobStore(storageAdapter)
        const chunkManager = new ChunkManager(blobStore)
        const blobService = new BlobService(chunkManager)

        // Store refs for later use
        storageRef.current = {
          sqliteAdapter,
          nodeStorage,
          storageAdapter,
          blobStore,
          blobService
        }

        if (cancelled) {
          await sqliteAdapter.close()
          return
        }

        // Check for existing identity
        const hasIdentity = await identityManager.hasIdentity()
        if (cancelled) return

        if (hasIdentity) {
          setAppState({ status: 'unlocking' })
          try {
            const keyBundle = await identityManager.unlock()
            if (cancelled) return
            setAppState({ status: 'authenticated', identity: keyBundle.identity, keyBundle })
          } catch (_err) {
            if (cancelled) return
            setAppState({ status: 'needs-onboarding' })
          }
        } else {
          setAppState({ status: 'needs-onboarding' })
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
      // Cleanup on unmount
      if (storageRef.current?.sqliteAdapter) {
        storageRef.current.sqliteAdapter.close().catch(console.error)
      }
    }
  }, [])

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback((identity: Identity, keyBundle: KeyBundle) => {
    setAppState({ status: 'authenticated', identity, keyBundle })
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
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
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
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <OnboardingProvider defaultHubUrl={HUB_URL} onComplete={handleOnboardingComplete}>
          <OnboardingFlow />
        </OnboardingProvider>
      </ThemeProvider>
    )
  }

  // Authenticated — render main app
  const { identity, keyBundle } = appState
  const storage = storageRef.current!

  return (
    <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
      <ErrorBoundary>
        <XNetProvider
          config={{
            nodeStorage: storage.nodeStorage,
            authorDID: identity.did as `did:key:${string}`,
            signingKey: keyBundle.signingKey,
            blobStore: storage.blobStore,
            hubUrl: HUB_URL,
            platform: 'web'
          }}
        >
          <BundledPluginInstaller />
          <XNetDevToolsProvider position="bottom" defaultOpen={false}>
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
