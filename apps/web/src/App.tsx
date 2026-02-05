/**
 * xNet Web - Main App Component
 *
 * Handles the onboarding flow and identity management.
 * Wraps the main app content with the necessary providers once authenticated.
 */
import type { Identity, KeyBundle } from '@xnet/identity'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { IndexedDBNodeStorageAdapter, BlobService } from '@xnet/data'
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
import { IndexedDBAdapter, BlobStore, ChunkManager } from '@xnet/storage'
import { ThemeProvider } from '@xnet/ui'
import { useState, useCallback, useEffect } from 'react'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

// ─── Router ─────────────────────────────────────────────────────
const router = createRouter({ routeTree, basepath: '/app' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// ─── Storage (singletons) ───────────────────────────────────────
const nodeStorage = new IndexedDBNodeStorageAdapter()
const storageAdapter = new IndexedDBAdapter()
const blobStore = new BlobStore(storageAdapter)
const chunkManager = new ChunkManager(blobStore)
const blobService = new BlobService(chunkManager)

// Identity manager (singleton)
const identityManager = createIdentityManager()

// Hub URL from env or default
const HUB_URL = import.meta.env.VITE_HUB_URL || 'wss://hub.xnet.fyi'

// ─── Types ──────────────────────────────────────────────────────
type AuthState =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | { status: 'unlocking' }
  | { status: 'authenticated'; identity: Identity; keyBundle: KeyBundle }
  | { status: 'error'; error: Error }

// ─── Main App ───────────────────────────────────────────────────
export function App(): JSX.Element {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' })

  // Check for existing identity on mount
  useEffect(() => {
    let cancelled = false

    async function checkIdentity() {
      try {
        await storageAdapter.open()

        const hasIdentity = await identityManager.hasIdentity()
        if (cancelled) return

        if (hasIdentity) {
          // Try to unlock with existing passkey
          setAuthState({ status: 'unlocking' })
          try {
            const keyBundle = await identityManager.unlock()
            if (cancelled) return
            setAuthState({ status: 'authenticated', identity: keyBundle.identity, keyBundle })
          } catch (_err) {
            // Unlock failed (user cancelled, etc.) — show onboarding
            if (cancelled) return
            setAuthState({ status: 'needs-onboarding' })
          }
        } else {
          setAuthState({ status: 'needs-onboarding' })
        }
      } catch (err) {
        if (cancelled) return
        setAuthState({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err))
        })
      }
    }

    checkIdentity()
    return () => {
      cancelled = true
    }
  }, [])

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback((identity: Identity, keyBundle: KeyBundle) => {
    setAuthState({ status: 'authenticated', identity, keyBundle })
  }, [])

  // ─── Render ─────────────────────────────────────────────────────

  // Loading state
  if (authState.status === 'loading') {
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
  if (authState.status === 'unlocking') {
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
  if (authState.status === 'error') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold mb-2 text-destructive">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">{authState.error.message}</p>
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
  if (authState.status === 'needs-onboarding') {
    return (
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <OnboardingProvider defaultHubUrl={HUB_URL} onComplete={handleOnboardingComplete}>
          <OnboardingFlow />
        </OnboardingProvider>
      </ThemeProvider>
    )
  }

  // Authenticated — render main app
  // XNetProvider handles SyncManager creation internally when hubUrl is provided
  const { identity, keyBundle } = authState

  return (
    <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
      <ErrorBoundary>
        <XNetProvider
          config={{
            nodeStorage,
            authorDID: identity.did as `did:key:${string}`,
            signingKey: keyBundle.signingKey,
            blobStore,
            hubUrl: HUB_URL,
            platform: 'web'
          }}
        >
          <BundledPluginInstaller />
          <XNetDevToolsProvider position="bottom" defaultOpen={false}>
            <BlobProvider blobService={blobService}>
              <OfflineIndicator />
              <RouterProvider router={router} />
            </BlobProvider>
          </XNetDevToolsProvider>
        </XNetProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
