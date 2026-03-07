/**
 * Right-side native preview workspace for preview, diff, files, markdown, and PR surfaces.
 */

import type { SessionSummaryNode } from './state/active-session'
import { Badge, MarkdownContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@xnetjs/ui'
import React, { useMemo } from 'react'

type PreviewWorkspaceProps = {
  activeSession: SessionSummaryNode | null
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
    session.lastMessagePreview ?? '_No prompt checkpoint recorded yet._',
    '',
    '## Next integrations',
    '',
    '- Git worktree creation and cleanup',
    '- Warm preview runtimes',
    '- Screenshot capture and PR drafting'
  ].join('\n')
}

function buildPrDraft(session: SessionSummaryNode): string {
  return [
    `feat(workspace): iterate on ${session.title ?? 'coding workspace shell'}`,
    '',
    '## Summary',
    '',
    '- update the coding workspace shell layout',
    '- carry the session metadata into the native preview surface',
    '- capture a screenshot before opening the PR flow',
    '',
    '## Notes',
    '',
    `- branch: ${session.branch ?? 'pending branch'}`,
    `- changed files: ${String(session.changedFilesCount ?? 0)}`
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

export function PreviewWorkspace({ activeSession }: PreviewWorkspaceProps): React.ReactElement {
  const sessionBrief = useMemo(
    () => (activeSession ? buildSessionBrief(activeSession) : ''),
    [activeSession]
  )
  const prDraft = useMemo(() => (activeSession ? buildPrDraft(activeSession) : ''), [activeSession])

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

        {activeSession ? (
          <Badge variant="outline">{String(activeSession.changedFilesCount ?? 0)} files</Badge>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
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
                body="The preview tab will render the warm runtime or cached frame for the selected worktree in Step 04."
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
                body="This session already carries denormalized shell state. Preview boot orchestration and warm switching land in Step 04."
              />
            )}
          </TabsContent>

          <TabsContent value="diff" className="min-h-0 flex-1">
            {!activeSession ? (
              <PlaceholderCard
                title="No diff available"
                body="Select a session to show changed-file counts, staged diffs, and review surfaces."
              />
            ) : (
              <div className="grid h-full gap-4 md:grid-cols-[1.05fr,0.95fr]">
                <div className="rounded-[28px] border border-border/70 bg-background/80 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Current status
                  </p>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-4xl font-semibold text-foreground">
                      {String(activeSession.changedFilesCount ?? 0)}
                    </span>
                    <span className="pb-1 text-sm text-muted-foreground">
                      files flagged for review
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    Real git diff ingestion is not wired yet. This tab is already reading the
                    xNet-backed summary record so the shell can update instantly once git metadata
                    starts flowing in.
                  </p>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-background/80 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Next feed
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-foreground">
                    <li>Inline diff summary from `git diff --stat`</li>
                    <li>Uncommitted file list for the right-panel file browser</li>
                    <li>Screenshot attachment and PR metadata</li>
                  </ul>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="files" className="min-h-0 flex-1">
            {!activeSession ? (
              <PlaceholderCard
                title="No file surface yet"
                body="This area will host file previews and markdown rendering for the selected worktree."
              />
            ) : (
              <div className="grid h-full gap-4">
                <div className="rounded-[28px] border border-border/70 bg-background/80 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Session metadata
                  </p>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">Worktree path</dt>
                      <dd className="font-mono text-foreground">
                        {activeSession.worktreePath ?? 'pending'}
                      </dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">OpenCode URL</dt>
                      <dd className="font-mono text-foreground">
                        {activeSession.openCodeUrl ?? 'pending'}
                      </dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">Preview URL</dt>
                      <dd className="font-mono text-foreground">
                        {activeSession.previewUrl ?? 'not attached'}
                      </dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">Last screenshot</dt>
                      <dd className="font-mono text-foreground">
                        {activeSession.lastScreenshotPath ?? 'not captured'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="markdown" className="min-h-0 flex-1">
            {!activeSession ? (
              <PlaceholderCard
                title="No markdown snapshot"
                body="The markdown tab will render generated notes, prompts, and PR descriptions for the selected session."
              />
            ) : (
              <div className="h-full overflow-y-auto rounded-[28px] border border-border/70 bg-background/85 p-5">
                <MarkdownContent content={sessionBrief} className="prose prose-invert max-w-none" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="pr" className="min-h-0 flex-1">
            {!activeSession ? (
              <PlaceholderCard
                title="No PR draft"
                body="Once a session has diff and screenshot artifacts, this tab will assemble a `gh pr create` draft."
              />
            ) : (
              <div className="h-full overflow-y-auto rounded-[28px] border border-border/70 bg-background/85 p-5">
                <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {prDraft}
                </pre>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
