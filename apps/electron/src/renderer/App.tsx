/**
 * Electron App - Main component
 *
 * The shell orchestration lives in `./shell/`: `shell-state.ts` is the pure
 * ShellState reducer, `useDocumentShell` owns the shell state, home canvas,
 * document queries and transition handlers, and `useShellPaletteCommands`
 * the command-palette table. This component composes those hooks and renders
 * per shell state.
 */

import type { ConnectHubRequest } from './components/ConnectHubDialog'
import { useCommandPalette, CommandPalette } from '@xnetjs/ui'
import React, { useCallback, useEffect, useState } from 'react'
import { ActionDock } from './components/ActionDock'
import { AddSharedDialog } from './components/AddSharedDialog'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { CanvasView } from './components/CanvasView'
import { ConnectHubDialog } from './components/ConnectHubDialog'
import { DatabaseView } from './components/DatabaseView'
import { DataWorkspaceView } from './components/DataWorkspaceView'
import { MeetingsView } from './components/MeetingsView'
import { PageView } from './components/PageView'
import { SettingsView } from './components/SettingsView'
import { SocialImportView } from './components/SocialImportView'
import { StorybookView } from './components/StorybookView'
import { SystemMenu } from './components/SystemMenu'
import { setPersistedHubUrl } from './lib/hub-url'
import { STORIES_ENABLED, useDocumentShell } from './shell/use-document-shell'
import { useShellPaletteCommands } from './shell/use-shell-palette-commands'

export function App(): React.ReactElement {
  const {
    shellState,
    overlayTitle,
    isCanvasInteractiveShell,
    prefersReducedMotion,
    homeCanvasId,
    homeCanvasBootstrapError,
    documents,
    recentDocuments,
    isLoading,
    pendingCanvasInsert,
    canvasCommandState,
    canvasViewRef,
    bootstrapHomeCanvas,
    focusDocument,
    handleOpenDocument,
    handleCreateLinkedDocument,
    handleCreateCanvasNote,
    handleReturnHome,
    handleAddShared,
    openDatabaseSplit,
    handleOpenSettings,
    handleOpenSocialImport,
    handleOpenDataWorkspace,
    handleOpenMeetings,
    handleOpenStories,
    handleInsertSavedLensAsCanvasFrame,
    handleCommandStateChange,
    handlePendingInsertConsumed
  } = useDocumentShell()
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const [prefilledShareValue, setPrefilledShareValue] = useState('')
  const [connectRequest, setConnectRequest] = useState<ConnectHubRequest | null>(null)
  const { open: paletteOpen, setOpen: setPaletteOpen, show: showPalette } = useCommandPalette()

  useEffect(() => {
    const cleanup = window.xnet.onSharePayload((payload) => {
      setPrefilledShareValue(payload)
      setShowAddSharedDialog(true)
    })
    return cleanup
  }, [])

  // xNet Cloud "Open in desktop app" (xnet://connect). The hub is already
  // hard-validated in the main process; surface a confirmation and never connect
  // without the user's explicit OK.
  useEffect(() => {
    const cleanup = window.xnet.onCloudConnect((data) => {
      setConnectRequest(data)
    })
    return cleanup
  }, [])

  const handleCloudConnect = useCallback(async (request: ConnectHubRequest) => {
    // Persist the hub so it survives restarts (mirrors the web setPersistedHubUrl),
    // then apply it live so sync re-points without a relaunch. The passkey +
    // device-claim is completed by the user in their dashboard.
    setPersistedHubUrl(request.hub)
    await window.__xnetIpcSyncManager?.configureShareSession({ signalingUrl: request.hub })
  }, [])

  const paletteCommands = useShellPaletteCommands({
    canvasViewRef,
    canvasCommandState,
    isCanvasInteractiveShell,
    shellKind: shellState.kind,
    recentDocuments,
    handleCreateLinkedDocument,
    handleCreateCanvasNote,
    handleOpenDocument,
    handleOpenSettings,
    handleOpenSocialImport,
    handleOpenDataWorkspace,
    handleOpenStories
  })

  const renderOverlay = () => {
    const overlaySurfaceClassName = [
      'flex h-full overflow-hidden rounded-[32px] border border-border/70 bg-background shadow-2xl shadow-black/10',
      prefersReducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-200'
    ].join(' ')

    if (shellState.kind === 'canvas-home') {
      return null
    }

    if (shellState.kind === 'settings') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <SettingsView onClose={handleReturnHome} />
          </div>
        </div>
      )
    }

    if (shellState.kind === 'stories') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <StorybookView />
          </div>
        </div>
      )
    }

    if (shellState.kind === 'social-import') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <SocialImportView
              onClose={handleReturnHome}
              onOpenDataWorkspace={handleOpenDataWorkspace}
            />
          </div>
        </div>
      )
    }

    if (shellState.kind === 'meetings') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <MeetingsView onClose={handleReturnHome} />
          </div>
        </div>
      )
    }

    if (shellState.kind === 'data-workspace') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <DataWorkspaceView
              onClose={handleReturnHome}
              onInsertSavedLensAsCanvasFrame={handleInsertSavedLensAsCanvasFrame}
            />
          </div>
        </div>
      )
    }

    if (shellState.kind === 'database-split') {
      return (
        <div className="pointer-events-none absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className="flex h-full justify-end">
            <div className="pointer-events-auto flex h-full w-[min(48vw,780px)] min-w-[420px] flex-col gap-4">
              <div className="flex justify-end">
                <div
                  className="flex items-center gap-3 rounded-full border border-border/70 bg-background/82 px-4 py-2 shadow-lg backdrop-blur-xl"
                  data-database-split-view="true"
                >
                  <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Canvas + Database
                  </span>
                  <button
                    type="button"
                    onClick={handleReturnHome}
                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Close split
                  </button>
                </div>
              </div>

              <div
                className={['min-h-0 flex-1', overlaySurfaceClassName].join(' ')}
                data-database-split-panel="true"
              >
                <DatabaseView docId={shellState.docId} minimalChrome />
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
        <div className="flex h-full flex-col gap-4">
          <div className="pointer-events-none flex justify-center">
            <div className="rounded-full border border-border/70 bg-background/80 px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground shadow-lg backdrop-blur-xl">
              {overlayTitle}
            </div>
          </div>

          <div className={['min-h-0 flex-1', overlaySurfaceClassName].join(' ')}>
            {shellState.kind === 'page-focus' ? (
              <PageView docId={shellState.docId} minimalChrome />
            ) : (
              <DatabaseView docId={shellState.docId} minimalChrome />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (homeCanvasBootstrapError && !homeCanvasId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="space-y-2">
          <p className="text-foreground">Unable to create your workspace canvas.</p>
          <p className="text-sm text-muted-foreground">{homeCanvasBootstrapError.message}</p>
        </div>
        <button
          type="button"
          onClick={() => void bootstrapHomeCanvas()}
          className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition-colors hover:opacity-90"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !homeCanvasId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <div className="animate-pulse">
          <p className="text-muted-foreground">Loading xNet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-50 h-[38px]">
        <div className="absolute inset-0 titlebar-drag" />
        <div className="relative flex h-full items-center justify-end px-3">
          <SystemMenu
            recentDocuments={recentDocuments}
            onOpenDocument={handleOpenDocument}
            onOpenSettings={handleOpenSettings}
            onOpenDataWorkspace={handleOpenDataWorkspace}
            onOpenMeetings={handleOpenMeetings}
            onOpenSocialImport={handleOpenSocialImport}
            onOpenStories={STORIES_ENABLED ? handleOpenStories : undefined}
            onAddShared={() => {
              setPrefilledShareValue('')
              setShowAddSharedDialog(true)
            }}
            onToggleDebugPanel={() => {
              window.dispatchEvent(new CustomEvent('xnet-devtools-toggle'))
            }}
          />
        </div>
      </header>

      <main className="relative h-full overflow-hidden pt-[38px]">
        <div
          className={[
            'absolute inset-0',
            prefersReducedMotion ? '' : 'transition-all duration-200',
            isCanvasInteractiveShell
              ? 'opacity-100'
              : prefersReducedMotion
                ? 'pointer-events-none opacity-70'
                : 'pointer-events-none scale-[0.985] opacity-70'
          ].join(' ')}
        >
          <CanvasView
            ref={canvasViewRef}
            docId={homeCanvasId}
            documents={documents}
            pendingInsert={pendingCanvasInsert}
            onCreatePage={() => void handleCreateLinkedDocument('page')}
            onCreateDatabase={() => void handleCreateLinkedDocument('database')}
            onCreateNote={handleCreateCanvasNote}
            onCommandStateChange={handleCommandStateChange}
            onPendingInsertConsumed={handlePendingInsertConsumed}
            onOpenDocument={(docId, docType) => focusDocument(docId, docType, true)}
            onOpenDatabaseSplit={openDatabaseSplit}
          />
        </div>

        {renderOverlay()}

        <ActionDock
          mode={isCanvasInteractiveShell ? 'canvas-home' : 'focused'}
          onCreatePage={() => void handleCreateLinkedDocument('page')}
          onCreateDatabase={() => void handleCreateLinkedDocument('database')}
          onCreateNote={handleCreateCanvasNote}
          onCreateShape={() => {
            canvasViewRef.current?.createShape('rectangle')
          }}
          onCreateFrame={() => {
            canvasViewRef.current?.createFrame()
          }}
          onCreateReference={() => {
            canvasViewRef.current?.createExternalReference()
          }}
          onCreateMedia={() => {
            canvasViewRef.current?.createMediaFile()
          }}
          onOpenSearch={showPalette}
          onReturnHome={handleReturnHome}
          onZoomOut={() => {
            canvasViewRef.current?.zoomOut()
          }}
          onZoomIn={() => {
            canvasViewRef.current?.zoomIn()
          }}
          onFitToContent={() => {
            canvasViewRef.current?.fitCanvasContent()
          }}
          onResetView={() => {
            canvasViewRef.current?.resetCanvasView()
          }}
        />
      </main>

      <AddSharedDialog
        isOpen={showAddSharedDialog}
        onClose={() => {
          setShowAddSharedDialog(false)
          setPrefilledShareValue('')
        }}
        onAdd={handleAddShared}
        initialValue={prefilledShareValue}
      />

      <ConnectHubDialog
        request={connectRequest}
        onCancel={() => setConnectRequest(null)}
        onConfirm={handleCloudConnect}
      />

      <CommandPalette commands={paletteCommands} open={paletteOpen} onOpenChange={setPaletteOpen} />

      <BundledPluginInstaller />
    </div>
  )
}
