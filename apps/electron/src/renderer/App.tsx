/**
 * Electron App - Main component
 *
 * The desktop app mounts the shared `<Workbench/>` chrome (exploration 0406)
 * over the desktop PlatformPort + WorkbenchHost. `./shell/` keeps the
 * orchestration: `shell-state.ts` is the pure ShellState reducer and
 * `useDocumentShell` owns the shell state, home canvas, document queries and
 * transition handlers — surviving as the navigation *implementation* behind
 * the port, exactly the deal the exploration drew.
 */

import type { ConnectHubRequest } from './components/ConnectHubDialog'
import { getCommandRegistry } from '@xnetjs/plugins'
import { PlatformProvider, setWorkbenchHost, Workbench } from '@xnetjs/workbench'
import { AiChatPanel } from '@xnetjs/workbench/ai'
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
import { setPersistedHubUrl } from './lib/hub-url'
import { useDesktopPlatformPort } from './shell/desktop-platform'
import { registerDesktopHostedViews } from './shell/hosted-views'
import { STORIES_ENABLED, useDocumentShell } from './shell/use-document-shell'
import { useDesktopWorkbenchHost } from './shell/workbench-host'

export function App(): React.ReactElement {
  const {
    shellState,
    homeCanvasId,
    homeCanvasBootstrapError,
    documents,
    isLoading,
    pendingCanvasInsert,
    canvasViewRef,
    bootstrapHomeCanvas,
    focusDocument,
    handleCreateLinkedDocument,
    handleCreateCanvasNote,
    handleReturnHome,
    handleAddShared,
    openDatabaseSplit,
    handleOpenDataWorkspace,
    handleOpenStories,
    handleInsertSavedLensAsCanvasFrame,
    handleCommandStateChange,
    handlePendingInsertConsumed,
    handleOpenDocument,
    handleOpenSettings,
    handleOpenMeetings,
    handleOpenAssistant,
    handleOpenSocialImport
  } = useDocumentShell()
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const [prefilledShareValue, setPrefilledShareValue] = useState('')
  const [connectRequest, setConnectRequest] = useState<ConnectHubRequest | null>(null)

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

  // The desktop PlatformPort (0406 phase 3): shared workbench modules navigate
  // by intent; this host resolves intents to ShellState transitions.
  const platform = useDesktopPlatformPort({
    shellState,
    returnHome: handleReturnHome,
    openDocument: handleOpenDocument,
    openAssistant: handleOpenAssistant,
    openSettings: handleOpenSettings,
    openMeetings: handleOpenMeetings,
    openDataWorkspace: handleOpenDataWorkspace,
    openSocialImport: handleOpenSocialImport
  })

  const desktopHost = useDesktopWorkbenchHost(platform.navigate, { addShared: handleAddShared })

  // Embedded Storybook (rung 1 of the prototyping ladder) is dev-only; the
  // workbench palette is its entry now that the bespoke menu is gone.
  useEffect(() => {
    if (!STORIES_ENABLED) return
    const disposable = getCommandRegistry().register({
      id: 'desktop.openStories',
      title: 'Open Stories',
      run: () => handleOpenStories()
    })
    return () => disposable.dispose()
  }, [handleOpenStories])

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

  // Fill both registries before the first chrome render (same boot rule as
  // web's __root): views + host, then the shared shell.
  registerDesktopHostedViews()
  setWorkbenchHost(desktopHost)

  return (
    <PlatformProvider value={platform}>
      <div
        className="flex h-screen flex-col overflow-hidden bg-background"
        style={{ '--titlebar-height': '38px' } as React.CSSProperties}
      >
        {/* hiddenInset window: the traffic lights sit at (16,16), so the shell
            starts below a slim drag strip instead of underneath them. The
            frames subtract --titlebar-height so the bottom islands stay
            on-screen. */}
        <header className="titlebar-drag h-[38px] shrink-0" />
        <div className="min-h-0 flex-1">
          <Workbench>
            {shellState.kind === 'page-focus' ? (
              <PageView docId={shellState.docId} minimalChrome />
            ) : shellState.kind === 'database-focus' || shellState.kind === 'database-split' ? (
              <DatabaseView docId={shellState.docId} minimalChrome />
            ) : shellState.kind === 'meetings' ? (
              <MeetingsView onClose={handleReturnHome} />
            ) : shellState.kind === 'data-workspace' ? (
              <DataWorkspaceView
                onClose={handleReturnHome}
                onInsertSavedLensAsCanvasFrame={handleInsertSavedLensAsCanvasFrame}
              />
            ) : shellState.kind === 'social-import' ? (
              <SocialImportView
                onClose={handleReturnHome}
                onOpenDataWorkspace={handleOpenDataWorkspace}
              />
            ) : shellState.kind === 'settings' ? (
              <SettingsView onClose={handleReturnHome} />
            ) : shellState.kind === 'assistant' ? (
              <AiChatPanel />
            ) : shellState.kind === 'stories' ? (
              <StorybookView />
            ) : (
              // canvas-home: the desktop differentiator stays the default
              // surface inside the unified shell (0406 open question 1 —
              // "default preset, not a different shell"). The ActionDock is
              // the canvas's tool dock, not shell chrome, so it rides inside
              // the editor area with its canvas.
              <div className="relative h-full">
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
                <ActionDock
                  mode="canvas-home"
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
                  onOpenSearch={() => void getCommandRegistry().runCommand('search.open')}
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
              </div>
            )}
          </Workbench>
        </div>

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

        <BundledPluginInstaller />
      </div>
    </PlatformProvider>
  )
}
