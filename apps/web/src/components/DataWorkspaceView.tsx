/**
 * DataWorkspaceView (web) — page chrome around the shared Data Workspace core
 * (@xnetjs/views, exploration 0276). Web-specific concerns: OPFS store-backed
 * seeding, social feed enrichment, and the moderation render gate.
 */
import { useNavigate } from '@tanstack/react-router'
import { useIdentity } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import {
  useDataWorkspace,
  DataWorkspaceBody,
  stashPendingCanvasLens,
  useSocialFeedEnrichment,
  type SavedViewCanvasFrameInput
} from '@xnetjs/views'
import { Database, Import, Loader2 } from 'lucide-react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { deskIdFor } from '../lib/desk'
import { ModeratedMedia } from './ModeratedMedia'

/**
 * Route each visual card through the moderation render gate (0177 W1): a
 * self-labelled / labeler-flagged item is blurred per the viewer's dial, with
 * the "why was this filtered?" explainer. Module-level so its identity is stable.
 */
const gateVisualItem = (nodeId: string, content: ReactNode): ReactNode => (
  <ModeratedMedia nodeId={nodeId}>{content}</ModeratedMedia>
)

export function DataWorkspaceView(): JSX.Element {
  const { store, isReady: storeReady } = useNodeStore()
  const feedEnrichment = useSocialFeedEnrichment()
  const navigate = useNavigate()
  const { identity } = useIdentity()
  const did = identity?.did

  /**
   * Send a saved lens to the Desk as a live query frame.
   *
   * The Desk is the right target because its id is derived from the identity
   * and visiting it provisions it — so this needs no "which canvas?" prompt
   * and no separate create. The request is parked, then claimed by the canvas
   * once it mounts.
   */
  const handleInsertSavedLensAsCanvasFrame = useCallback(
    (view: SavedViewCanvasFrameInput) => {
      if (!did) return

      const canvasId = deskIdFor(did)
      stashPendingCanvasLens({
        canvasId,
        viewId: view.id,
        title: view.title ?? 'Saved lens',
        descriptorJson: view.descriptor ?? null,
        ...(view.projection ? { projection: view.projection } : {})
      })
      void navigate({ to: '/canvas/$canvasId', params: { canvasId } })
    },
    [did, navigate]
  )

  const workspace = useDataWorkspace({
    seedReady: Boolean(store && storeReady),
    getExistingNode: (id) => (store ? Promise.resolve(store.get(id)) : Promise.resolve(undefined)),
    // Without an identity there is no Desk to target, so the canvas actions
    // stay hidden rather than failing when pressed.
    ...(did ? { onInsertSavedLensAsCanvasFrame: handleInsertSavedLensAsCanvasFrame } : {})
  })
  const { seeding, seedReady, handleSeedWorkspace } = workspace

  const savedViewRunnerProps = useMemo(
    () => ({ feedEnrichment, wrapItem: gateVisualItem }),
    [feedEnrichment]
  )

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database size={15} />
            <span>Imported data</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Data Workspace</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Saved views and starter graph lenses over typed xNet data, seeded by social imports.
          </p>
        </div>
        <button
          type="button"
          disabled={!seedReady || seeding}
          onClick={() => void handleSeedWorkspace()}
          className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {seeding ? <Loader2 size={15} className="animate-spin" /> : <Import size={15} />}
          Seed Social Views
        </button>
      </header>

      <DataWorkspaceBody workspace={workspace} savedViewRunnerProps={savedViewRunnerProps} />
    </div>
  )
}
