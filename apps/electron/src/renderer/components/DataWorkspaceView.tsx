/**
 * DataWorkspaceView (desktop) — overlay chrome around the shared Data
 * Workspace core (@xnetjs/views, exploration 0276). Desktop-specific
 * concerns: IPC-backed seeding + import-job progress, the close affordance,
 * and inserting saved lenses onto the canvas as frames.
 */
import { upsertSocialImportJobProgress } from '@xnetjs/social/import/core'
import { useDataWorkspace, DataWorkspaceBody, type SavedViewCanvasFrameInput } from '@xnetjs/views'
import { Database, Import, Loader2, X } from 'lucide-react'
import React, { useEffect } from 'react'

export type { SavedViewCanvasFrameInput }

type DataWorkspaceViewProps = {
  onClose: () => void
  onInsertSavedLensAsCanvasFrame?: (input: SavedViewCanvasFrameInput) => void
}

export function DataWorkspaceView({
  onClose,
  onInsertSavedLensAsCanvasFrame
}: DataWorkspaceViewProps): React.ReactElement {
  const workspace = useDataWorkspace({
    getExistingNode: (id) => window.xnetNodes.getNode(id),
    onInsertSavedLensAsCanvasFrame
  })
  const { seeding, handleSeedWorkspace, refreshSocialImportJobs } = workspace

  // Bridge main-process commit jobs into the renderer's import-job store so
  // progress started from the main process shows up in the shared panel.
  useEffect(() => {
    void window.xnetSocialImport
      .listCommitJobs()
      .then((jobs) => {
        jobs.forEach(upsertSocialImportJobProgress)
        refreshSocialImportJobs()
      })
      .catch(() => undefined)

    const unsubscribe = window.xnetSocialImport.onCommitJob((job) => {
      upsertSocialImportJobProgress(job)
      refreshSocialImportJobs()
    })

    return unsubscribe
  }, [refreshSocialImportJobs])

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database size={15} />
            <span>Imported data</span>
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold">Data Workspace</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedWorkspace()}
            className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {seeding ? <Loader2 size={15} className="animate-spin" /> : <Import size={15} />}
            Seed Social Views
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close data workspace"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Saved views and starter graph lenses over typed xNet data, seeded by social imports.
            </p>
          </div>

          <DataWorkspaceBody workspace={workspace} />
        </div>
      </div>
    </div>
  )
}
