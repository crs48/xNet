/**
 * Three-panel coding workspace shell for the Electron app.
 */

import { Badge, Button, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@xnetjs/ui'
import { ArrowLeft, Code2, RefreshCcw, Settings, Trash2 } from 'lucide-react'
import React, { useCallback } from 'react'
import { useActiveSession } from './hooks/useActiveSession'
import { useSessionCommands } from './hooks/useSessionCommands'
import { useWorkspaceSessionSync } from './hooks/useWorkspaceSessionSync'
import { OpenCodePanel } from './OpenCodePanel'
import { PreviewWorkspace } from './PreviewWorkspace'
import { SessionRail } from './SessionRail'

type DevWorkspaceShellProps = {
  onReturnToCanvas: () => void
  onOpenSettings: () => void
}

function createWorkspaceSessionTitle(index: number): string {
  return `Workspace Session ${String(index).padStart(2, '0')}`
}

export function DevWorkspaceShell({
  onReturnToCanvas,
  onOpenSettings
}: DevWorkspaceShellProps): React.ReactElement {
  const { activeSession, activeSessionId, summaries, summariesLoading, summariesError, reload } =
    useActiveSession()
  const {
    createWorkspaceSession,
    refreshWorkspaceSession,
    removeWorkspaceSession,
    restartWorkspacePreview,
    selectSession
  } = useSessionCommands()

  useWorkspaceSessionSync({
    summaries,
    activeSessionId
  })

  const handleCreateSession = useCallback(async () => {
    const nextIndex = summaries.length + 1
    await createWorkspaceSession({
      title: createWorkspaceSessionTitle(nextIndex)
    })
  }, [createWorkspaceSession, summaries.length])

  const handleRefresh = useCallback(async () => {
    if (activeSession) {
      await refreshWorkspaceSession(activeSession)
      return
    }

    await reload()
  }, [activeSession, refreshWorkspaceSession, reload])

  const handleRemoveActiveSession = useCallback(async () => {
    if (!activeSession) {
      return
    }

    const confirmed = window.confirm(
      `Remove ${activeSession.title ?? 'this session'} and its worktree? Clean worktrees only.`
    )
    if (!confirmed) {
      return
    }

    const result = await removeWorkspaceSession(activeSession)
    if (!result.removed) {
      window.alert(result.message)
    }
  }, [activeSession, removeWorkspaceSession])

  const handleRestartPreview = useCallback(async () => {
    if (!activeSession) {
      return
    }

    await restartWorkspacePreview(activeSession)
  }, [activeSession, restartWorkspacePreview])

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(250,204,21,0.1),transparent_30%)]" />

      <header className="absolute inset-x-0 top-0 z-50 h-[38px]">
        <div className="absolute inset-0 titlebar-drag" />
        <div className="relative flex h-full items-center justify-between gap-3 px-3">
          <div className="titlebar-no-drag flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground shadow-lg backdrop-blur-xl">
              <Code2 className="h-3.5 w-3.5" />
              Coding Workspace
            </div>
            {activeSession ? (
              <div className="hidden min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur-xl md:flex">
                <span className="truncate">{activeSession.title ?? 'Untitled session'}</span>
                <span className="text-border">/</span>
                <span className="truncate font-mono">{activeSession.branch ?? 'no-branch'}</span>
              </div>
            ) : null}
          </div>

          <div className="titlebar-no-drag flex items-center gap-2">
            <Badge variant="outline">{String(summaries.length)} sessions</Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<RefreshCcw />}
              onClick={() => {
                void handleRefresh()
              }}
            >
              Refresh
            </Button>
            {activeSession ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<Trash2 />}
                onClick={() => {
                  void handleRemoveActiveSession()
                }}
              >
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<Settings />}
              onClick={onOpenSettings}
            >
              Settings
            </Button>
            <Button type="button" size="sm" leftIcon={<ArrowLeft />} onClick={onReturnToCanvas}>
              Canvas
            </Button>
          </div>
        </div>
      </header>

      <main className="relative h-full overflow-hidden pt-[38px]">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={18} minSize={16}>
            <SessionRail
              sessions={summaries}
              activeSession={activeSession}
              activeSessionId={activeSessionId}
              loading={summariesLoading}
              error={summariesError}
              onCreateSession={() => {
                void handleCreateSession()
              }}
              onRemoveSession={() => {
                void handleRemoveActiveSession()
              }}
              onSelectSession={(sessionId) => {
                void selectSession(sessionId)
              }}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={34} minSize={24}>
            <OpenCodePanel activeSession={activeSession} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={48} minSize={28}>
            <PreviewWorkspace
              activeSession={activeSession}
              onRefreshSession={() => {
                void handleRefresh()
              }}
              onRestartPreview={() => {
                void handleRestartPreview()
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}
