/**
 * xNet Web - Main App Component
 *
 * Handles SQLite initialization, onboarding flow, and identity management.
 * Uses SQLite with OPFS for persistent local-first storage.
 *
 * The boot orchestration lives in `./boot/`: `useBootSequence` owns the
 * storage-init state machine, `useStorageDurability` the durability and
 * corruption watchers, and `useWebInstallPrompt` the PWA install plumbing.
 * This component composes those hooks and renders per boot state.
 */
import type { Identity, KeyBundle } from '@xnetjs/identity'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { XNetDevToolsProvider } from '@xnetjs/devtools'
import { BlobProvider } from '@xnetjs/editor/react'
import {
  XNetProvider,
  OnboardingProvider,
  OnboardingFlow,
  ErrorBoundary,
  OfflineIndicator
} from '@xnetjs/react'
import { requestPersistentStorage, showUnsupportedBrowserMessage } from '@xnetjs/sqlite'
import { ThemeProvider } from '@xnetjs/ui'
import { useState, useCallback, useEffect } from 'react'
import { updateAppStorageStatus, resolveWebRuntime } from './boot/boot-machine'
import { useBootSequence } from './boot/use-boot-sequence'
import { useWebInstallPrompt } from './boot/use-install-prompt'
import { useStorageDurability } from './boot/use-storage-durability'
import { BootTimelineProbe } from './components/BootTimelineProbe'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { ConsentBanner } from './components/ConsentBanner'
import { ReportProblemDialog } from './components/ReportProblemDialog'
import { StorageOptimiseHint } from './components/StorageOptimiseHint'
import { StorageWarningBanner } from './components/StorageWarningBanner'
import { WarmStartSnapshots } from './components/WarmStartSnapshots'
import { WorkingSetPrewarm } from './components/WorkingSetPrewarm'
import { AtprotoProfileLinker } from './identity/AtprotoProfileLinker'
import { runAtprotoCeremony } from './identity/atproto-ceremony'
import { reportBootFailure } from './lib/boot-diagnostics'
import {
  clearXNetBrowserStorage,
  requestXNetBrowserStorageReset
} from './lib/browser-storage-reset'
import { detectBrowserFamily, getStorageBanner } from './lib/storage-banner'
import { recordDurabilityTransition } from './lib/storage-durability'
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

// ─── Unsupported Browser Component ──────────────────────────────
function UnsupportedBrowser({ reason }: { reason: string }): JSX.Element {
  useEffect(() => {
    showUnsupportedBrowserMessage(reason)
  }, [reason])
  return <div id="app" />
}

// ─── Main App ───────────────────────────────────────────────────
export function App(): JSX.Element {
  const { appState, setAppState, storageRef, traceCollector, hubUrl, authToken } = useBootSequence()
  const [isRequestingStorage, setIsRequestingStorage] = useState(false)
  const [isInstallingApp, setIsInstallingApp] = useState(false)
  const [isResettingStorage, setIsResettingStorage] = useState(false)
  const [reportingProblem, setReportingProblem] = useState(false)
  const [browserFamily] = useState(() => detectBrowserFamily())
  const {
    canInstall: canInstallApp,
    isInstalled: isInstalledApp,
    promptInstall
  } = useWebInstallPrompt()

  useStorageDurability(setAppState, storageRef)

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(
    (identity: Identity, keyBundle: KeyBundle) => {
      setAppState((current) => ({
        status: 'authenticated',
        identity,
        keyBundle,
        storageWarning: 'storageWarning' in current ? current.storageWarning : undefined,
        storageStatus: 'storageStatus' in current ? current.storageStatus : undefined
      }))
    },
    [setAppState]
  )

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
  }, [setAppState])

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
  }, [promptInstall, setAppState])

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
  }, [setAppState])

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
            <button
              onClick={() => setReportingProblem(true)}
              className="mt-4 text-xs text-muted-foreground underline hover:text-foreground"
            >
              Report a problem
            </button>
          </div>
        </div>
        {reportingProblem && <ReportProblemDialog onClose={() => setReportingProblem(false)} />}
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
        <OnboardingProvider
          defaultHubUrl={hubUrl}
          onComplete={handleOnboardingComplete}
          runAtprotoCeremony={runAtprotoCeremony}
        >
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
      {/* "Optimising storage" pill while the interrupted-retry conversion
          VACUUM is in flight (lib/db-vacuum.ts) — reloading cancels it. */}
      <StorageOptimiseHint />
      <ErrorBoundary onError={(error) => reportBootFailure('render', error)}>
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
          <AtprotoProfileLinker />
          <WarmStartSnapshots did={identity.did} />
          <WorkingSetPrewarm />
          <BundledPluginInstaller />
          <XNetDevToolsProvider
            position="bottom"
            defaultOpen={false}
            hideFab
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
