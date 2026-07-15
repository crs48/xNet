/**
 * Agent-PR sessions (exploration 0329 P4): assistant writes land in a draft
 * by default, the human reviews a diff, merge is the gate.
 *
 * Wraps the store-level overlay in `'dynamic'` membership: EVERY node the
 * agent writes is lazily forked (never-fork schemas and non-forkables pass
 * through untouched), every node it creates is tracked as draft-born, and
 * ending the session requests review — surfacing the draft in Requests.
 * The host wraps an assistant run with start/end; the AI service itself
 * never learns drafts exist (the overlay is transparent).
 */

import type { NodeId, NodeState, NodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createDraft, draftEntries, forkNodeIntoDraft, isForkable, markCreatedInDraft } from './draft'

export interface AgentDraftSession {
  /** The Draft node backing this session. */
  draft: NodeState
  /**
   * End the session: return the store to main and (by default) request
   * review so the draft appears in Requests. `discard: true` is a no-touch
   * abort hook for callers that also call `discardDraft`.
   */
  end(options?: { requestReview?: boolean }): Promise<void>
}

/**
 * Start an agent draft session: create an open draft and check it out with
 * dynamic membership. Returns the session handle; the caller runs the agent,
 * then calls `end()`.
 */
export async function startAgentDraft(
  store: NodeStore,
  storage: NodeStorageAdapter,
  options: { name: string; targetId?: NodeId }
): Promise<AgentDraftSession> {
  const draft = await createDraft(store, { name: options.name, targetId: options.targetId })

  // Draft-born tracking is triggered from a sync hook; end() awaits the tail.
  // Serialized: the `created` array is one LWW property — parallel updates
  // would clobber each other's appends.
  let trackingChain: Promise<void> = Promise.resolve()

  store.setCheckedOutDraft({
    draftId: draft.id,
    members: 'dynamic',
    clones: {},
    onMissingMember: async (originalId) => {
      const original = await store.getRaw(originalId)
      if (!original || !isForkable(original.schemaId)) return null
      const entry = await forkNodeIntoDraft(store, storage, draft.id, originalId)
      return entry.cloneId as NodeId
    },
    onNodeCreated: (nodeId, schemaId) => {
      if (!isForkable(schemaId)) return
      // Clones minted by forkNodeIntoDraft use importDeterministicNodes and
      // never reach this hook; anything else the agent creates is draft-born.
      trackingChain = trackingChain
        .then(() => markCreatedInDraft(store, draft.id, nodeId))
        .catch((err) => console.error('Failed to track draft-born node:', err))
    }
  })

  return {
    draft,
    async end(endOptions?: { requestReview?: boolean }): Promise<void> {
      await trackingChain
      // Only release the checkout if it is still OURS (the user may have
      // switched drafts mid-run).
      if (store.getCheckedOutDraft()?.draftId === draft.id) {
        store.setCheckedOutDraft(null)
      }
      const requestReview = endOptions?.requestReview ?? true
      const current = await store.getRaw(draft.id)
      const touched =
        Object.keys(draftEntries(current ?? draft)).length > 0 ||
        (((current ?? draft).properties.created as NodeId[] | undefined) ?? []).length > 0
      if (requestReview && touched) {
        await store.update(draft.id, { properties: { reviewRequested: true } })
      }
    }
  }
}
