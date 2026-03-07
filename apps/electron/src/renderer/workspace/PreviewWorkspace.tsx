/**
 * Right-side native preview workspace for preview, review, markdown, and PR flows.
 */

import type { SessionSummaryNode } from './state/active-session'
import { useTelemetry } from '@xnetjs/telemetry'
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@xnetjs/ui'
import { RefreshCcw, RotateCw } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { useSessionCommands } from './hooks/useSessionCommands'
import { useWorkspaceReview } from './hooks/useWorkspaceReview'
import { ChangedFilesPanel } from './panels/ChangedFilesPanel'
import { DiffPanel } from './panels/DiffPanel'
import { MarkdownPreviewPanel } from './panels/MarkdownPreviewPanel'
import { PrDraftPanel } from './panels/PrDraftPanel'
import { consumeWorkspacePreviewRestoreDuration } from './performance'

type PreviewWorkspaceProps = {
  activeSession: SessionSummaryNode | null
  onRefreshSession?: () => void | Promise<void>
  onRestartPreview?: () => void | Promise<void>
}

function buildSessionBrief(session: SessionSummaryNode): string {
  return [
    `# ${session.title ?? 'Untitled session'}`,
    '',
    `- Branch: \`${session.branch ?? 'no-branch'}\``,
    `- Worktree: \`${session.worktreePath ?? 'pending worktree'}\``,
    `- OpenCode: \`${session.openCodeUrl ?? 'pending host'}\``,
    `- State: \`${session.state ?? 'idle'}\``,
    '',
    '## Current prompt context',
    '',
    session.lastMessagePreview ?? '_No prompt checkpoint recorded yet._'
  ].join('\n')
}

function PlaceholderCard({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/70 px-8 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

export function PreviewWorkspace({
  activeSession,
  onRefreshSession,
  onRestartPreview
}: PreviewWorkspaceProps): React.ReactElement {
  const telemetry = useTelemetry({ component: 'electron.workspace.preview' })
  const { captureWorkspaceScreenshot, createWorkspacePullRequest } = useSessionCommands()
  const { review, loading, error, refresh } = useWorkspaceReview(activeSession)
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [creatingPullRequest, setCreatingPullRequest] = useState(false)
  const [prStatus, setPrStatus] = useState<string | null>(null)

  const sessionBrief = useMemo(
    () => (activeSession ? buildSessionBrief(activeSession) : ''),
    [activeSession]
  )

  useEffect(() => {
    if (!activeSession?.previewUrl) {
      return
    }

    const duration = consumeWorkspacePreviewRestoreDuration(activeSession.id)
    if (duration === null) {
      return
    }

    telemetry.reportPerformance('workspace.preview.restore', duration, 'electron.workspace')
    if (duration > 100) {
      telemetry.reportUsage('workspace.preview.restore.slow', 1)
    }
  }, [activeSession?.id, activeSession?.previewUrl, telemetry])

  const handleCaptureScreenshot = async (): Promise<void> => {
    if (!activeSession) {
      return
    }

    setCapturingScreenshot(true)
    setPrStatus(null)
    const start = performance.now()

    try {
      const result = await captureWorkspaceScreenshot(activeSession)
      setPrStatus(`Captured screenshot at ${result.path}`)
      telemetry.reportPerformance(
        'workspace.screenshot.capture.visible',
        performance.now() - start,
        'electron.workspace'
      )
      await refresh()
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError)
      setPrStatus(`Screenshot capture failed: ${message}`)
      telemetry.reportCrash(nextError instanceof Error ? nextError : new Error(String(nextError)), {
        codeNamespace: 'electron.workspace',
        codeFunction: 'workspace.screenshot.capture.visible',
        sessionId: activeSession.id
      })
    } finally {
      setCapturingScreenshot(false)
    }
  }

  const handleCreatePullRequest = async (): Promise<void> => {
    if (!activeSession || !review) {
      return
    }

    setCreatingPullRequest(true)
    setPrStatus(null)
    const start = performance.now()

    try {
      const result = await createWorkspacePullRequest(activeSession, review.prDraft)
      if (result.created) {
        setPrStatus(result.url ? `Created PR: ${result.url}` : 'Created PR draft successfully.')
      } else {
        setPrStatus(
          `PR creation failed. Draft saved to ${result.bodyFilePath}. ${result.error ?? ''}`.trim()
        )
      }
      telemetry.reportPerformance(
        'workspace.pr.create.visible',
        performance.now() - start,
        'electron.workspace'
      )
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError)
      setPrStatus(`PR creation failed: ${message}`)
      telemetry.reportCrash(nextError instanceof Error ? nextError : new Error(String(nextError)), {
        codeNamespace: 'electron.workspace',
        codeFunction: 'workspace.pr.create.visible',
        sessionId: activeSession.id
      })
    } finally {
      setCreatingPullRequest(false)
    }
  }

  return (
    <section className="flex h-full flex-col bg-background/70 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Preview Workspace
          </div>
          <p className="text-sm font-semibold text-foreground">
            {activeSession?.title ?? 'Preview, diffs, files, and PRs'}
          </p>
          <p className="text-xs text-muted-foreground">
            {activeSession
              ? `${activeSession.branch ?? 'no-branch'} · ${activeSession.worktreePath ?? 'pending worktree'}`
              : 'Select a session to inspect the native surfaces around the chat UI.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeSession ? (
            <>
              {activeSession.isDirty ? (
                <Badge variant="outline" className="border-amber-500/50">
                  Dirty
                </Badge>
              ) : null}
              <Badge variant="outline">{String(activeSession.changedFilesCount ?? 0)} files</Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<RefreshCcw />}
                onClick={onRefreshSession}
              >
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<RotateCw />}
                onClick={onRestartPreview}
              >
                Restart preview
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {activeSession?.lastError ? (
          <div className="mb-4 rounded-[24px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {activeSession.lastError}
          </div>
        ) : null}

        <Tabs defaultValue="preview" className="flex h-full flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
            <TabsTrigger value="pr">PR</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="min-h-0 flex-1">
            {!activeSession ? (
              <PlaceholderCard
                title="No preview selected"
                body="The preview tab renders the warm runtime for the selected worktree."
              />
            ) : activeSession.state === 'error' ? (
              <PlaceholderCard
                title="Preview needs attention"
                body={
                  activeSession.lastError ||
                  'The selected session hit a preview runtime error. Use the restart control in the header to bring the warm preview back.'
                }
              />
            ) : activeSession.state === 'running' ? (
              <PlaceholderCard
                title="Starting preview runtime"
                body="The worktree preview is booting in the background. The panel will swap in as soon as the warm runtime is ready."
              />
            ) : activeSession.previewUrl ? (
              <div className="h-full overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-2xl shadow-black/10">
                <iframe
                  title="Preview"
                  src={activeSession.previewUrl}
                  className="h-full w-full border-0 bg-white"
                />
              </div>
            ) : (
              <PlaceholderCard
                title="Preview runtime not attached yet"
                body="This session is ready for review data, but its live preview is not attached yet."
              />
            )}
          </TabsContent>

          <TabsContent value="diff" className="min-h-0 flex-1 overflow-y-auto">
            {!activeSession ? (
              <PlaceholderCard
                title="No diff available"
                body="Select a session to inspect its git diff and patch."
              />
            ) : (
              <DiffPanel review={review} loading={loading} error={error} />
            )}
          </TabsContent>

          <TabsContent value="files" className="min-h-0 flex-1 overflow-y-auto">
            {!activeSession ? (
              <PlaceholderCard
                title="No file surface yet"
                body="Select a session to review changed files from its worktree."
              />
            ) : (
              <ChangedFilesPanel review={review} loading={loading} error={error} />
            )}
          </TabsContent>

          <TabsContent value="markdown" className="min-h-0 flex-1">
            {!activeSession ? (
              <PlaceholderCard
                title="No markdown snapshot"
                body="The markdown tab renders changed markdown files or the selected context prompt."
              />
            ) : (
              <MarkdownPreviewPanel
                review={review}
                loading={loading}
                error={error}
                fallbackContent={sessionBrief}
              />
            )}
          </TabsContent>

          <TabsContent value="pr" className="min-h-0 flex-1 overflow-y-auto">
            {!activeSession ? (
              <PlaceholderCard
                title="No PR draft"
                body="Once a session has review data, this tab can capture a screenshot and call `gh pr create`."
              />
            ) : (
              <PrDraftPanel
                review={review}
                prStatus={prStatus}
                loading={loading}
                creatingPullRequest={creatingPullRequest}
                capturingScreenshot={capturingScreenshot}
                onCaptureScreenshot={() => {
                  void handleCaptureScreenshot()
                }}
                onCreatePullRequest={() => {
                  void handleCreatePullRequest()
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
