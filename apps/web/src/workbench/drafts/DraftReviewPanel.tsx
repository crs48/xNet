/**
 * DraftReviewPanel — merge review for the focused node's drafts (exploration
 * 0329 P3, the SECOND context tool after the Time Machine).
 *
 * For the checked-out draft (or any open draft picked from the list):
 * per-property diff cards — main's value vs the draft's value vs the fork
 * base — computed by `useDraft.computeReview` (three-way on raw states,
 * applying NOTHING); both-sides-changed conflicts highlighted; a "document
 * edited in draft" line for Yjs members (byte-level indicator — text diff is
 * deferred); Refresh-from-main with an explicit conflict pause state; Merge
 * with confirm (conflicts show the cards, success notes and returns to
 * main); and "Request review" (P4) flagging the draft for the Requests
 * surface.
 */
import type { NodeState } from '@xnetjs/data'
import type { DraftReview, DraftReviewCard } from '@xnetjs/react'
import { useDraft } from '@xnetjs/react'
import { FileText, GitBranch, GitMerge, Inbox, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatValue } from '../timemachine/diff-format'

function ValueRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="w-9 shrink-0 text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2" title={formatValue(value)}>
        {formatValue(value)}
      </span>
    </div>
  )
}

/** One property card: main vs draft (vs base), conflicts tinted. */
function PropertyCard({ card }: { card: DraftReviewCard }) {
  return (
    <li
      data-testid={card.conflict ? 'draft-card-conflict' : 'draft-card'}
      className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 ${
        card.conflict ? 'border-destructive/50 bg-destructive/10' : 'border-hairline bg-island'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-1">
          {card.property}
        </span>
        {card.conflict && (
          <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive">
            conflict
          </span>
        )}
      </div>
      <ValueRow label="main" value={card.main} />
      <ValueRow label="draft" value={card.draft} />
      {card.conflict && <ValueRow label="base" value={card.base} />}
    </li>
  )
}

function draftName(draft: NodeState): string {
  return String(draft.properties.name ?? 'Unnamed draft')
}

export function DraftReviewPanel({ nodeId }: { nodeId: string }) {
  const d = useDraft(nodeId as never)

  // Which draft is under review: the checked-out one wins; otherwise pick.
  const [pickedId, setPickedId] = useState<string | null>(null)
  const draft =
    d.checkedOut ??
    d.drafts.find((candidate) => candidate.id === pickedId) ??
    d.drafts[0] ??
    null

  const [review, setReview] = useState<DraftReview | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paused, setPaused] = useState(false) // refresh hit conflicts
  const [busy, setBusy] = useState(false)

  const loadReview = useCallback(async () => {
    if (!draft) {
      setReview(null)
      return
    }
    setReview(await d.computeReview(draft.id))
  }, [draft, d.computeReview])

  useEffect(() => {
    void loadReview()
  }, [loadReview])

  // Transient success note.
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  if (!draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
        <GitBranch size={16} strokeWidth={1.5} className="text-ink-3" />
        <p className="m-0 text-[11px] text-ink-3">
          No open drafts for this item. Create one from the Draft switcher to edit privately and
          review before merging.
        </p>
        {notice && (
          <p role="status" className="m-0 text-[11px] text-ink-2">
            {notice}
          </p>
        )}
      </div>
    )
  }

  const conflicts = review?.cards.filter((card) => card.conflict) ?? []
  const pending = review?.cards.filter((card) => !card.conflict) ?? []
  const editedDocs = review?.members.filter((m) => m.hasDocument && m.documentDiffers) ?? []
  const reviewRequested = draft.properties.reviewRequested === true

  const handleRefresh = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await d.refresh(draft.id)
      if (result?.status === 'conflicts') {
        setPaused(true)
      } else if (result?.status === 'refreshed') {
        setPaused(false)
        setNotice(
          result.refreshedMembers > 0
            ? 'Refreshed — the draft now floats on the latest main.'
            : 'Already up to date with main.'
        )
      }
      await loadReview()
    } finally {
      setBusy(false)
    }
  }

  const handleMerge = async () => {
    if (busy) return
    const ok = window.confirm(
      `Merge the draft “${draftName(draft)}” into main? ` +
        'Its changes land as one reviewed batch signed by you.'
    )
    if (!ok) return
    setBusy(true)
    try {
      const result = await d.merge(draft.id)
      if (result?.status === 'merged') {
        setNotice('Merged — you are back on main.')
        setPickedId(null)
        setReview(null)
      } else if (result?.status === 'conflicts') {
        await loadReview() // show the cards
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3" data-testid="draft-review">
      {/* Which draft is under review */}
      <div className="flex items-center gap-2">
        <GitBranch size={13} strokeWidth={1.75} className="shrink-0 text-ink-3" />
        {d.checkedOut ? (
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-1">
            {draftName(draft)}
          </span>
        ) : (
          <select
            value={draft.id}
            onChange={(e) => setPickedId(e.target.value)}
            aria-label="Draft under review"
            className="min-w-0 flex-1 cursor-pointer rounded-md border border-hairline bg-island px-1.5 py-0.5 text-[12px] text-ink-1 outline-none"
          >
            {d.drafts.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {draftName(candidate)}
              </option>
            ))}
          </select>
        )}
        {!d.checkedOut && (
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
            not checked out
          </span>
        )}
      </div>

      {/* Refresh conflict pause (Upwelling's floating drafts, paused) */}
      {paused && (
        <p role="alert" className="m-0 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          Refresh paused — main and this draft changed the same properties. Resolve below (edit the
          draft or merge with the conflicts in view).
        </p>
      )}

      {/* Pending changes */}
      <div className="flex min-h-0 flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
          {review === null
            ? 'Reading draft…'
            : `${review.cards.length} pending ${review.cards.length === 1 ? 'change' : 'changes'}${
                conflicts.length > 0 ? ` · ${conflicts.length} in conflict` : ''
              }`}
        </span>
        {review !== null && review.cards.length === 0 && editedDocs.length === 0 && (
          <p className="m-0 text-[11px] text-ink-3">
            No record changes yet — edit while checked out and the diff shows up here.
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-1 overflow-y-auto p-0">
          {conflicts.map((card) => (
            <PropertyCard key={`${card.originalId}:${card.property}`} card={card} />
          ))}
          {pending.map((card) => (
            <PropertyCard key={`${card.originalId}:${card.property}`} card={card} />
          ))}
        </ul>
        {editedDocs.map((member) => (
          <p
            key={member.originalId}
            className="m-0 flex items-center gap-1.5 text-[11px] text-ink-2"
            data-testid="draft-doc-edited"
          >
            <FileText size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            Document edited in draft (text diff not shown yet)
          </p>
        ))}
      </div>

      {notice && (
        <p role="status" className="m-0 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-ink-2">
          {notice}
        </p>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-1.5 border-t border-hairline pt-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={busy}
            title="Fold main's newer changes into this draft"
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-transparent px-2 py-1 text-[12px] text-ink-1 hover:bg-background-muted disabled:cursor-default disabled:opacity-40"
          >
            <RefreshCw size={12} strokeWidth={1.75} />
            Refresh from main
          </button>
          <button
            type="button"
            onClick={() => void handleMerge()}
            disabled={busy || conflicts.length > 0}
            title={
              conflicts.length > 0
                ? 'Resolve the conflicting properties before merging'
                : 'Merge this draft into main as one reviewed batch'
            }
            className="flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-primary px-2 py-1 text-[12px] font-medium text-primary-foreground disabled:cursor-default disabled:opacity-40"
          >
            <GitMerge size={12} strokeWidth={1.75} />
            Merge
          </button>
        </div>
        <button
          type="button"
          onClick={() => void d.setReviewRequested(draft.id, !reviewRequested)}
          className="flex cursor-pointer items-center gap-1.5 self-start rounded-md border-none bg-transparent px-1 py-0.5 text-[11px] text-ink-3 hover:text-ink-1"
        >
          <Inbox size={12} strokeWidth={1.5} />
          {reviewRequested ? 'Review requested — withdraw' : 'Request review'}
        </button>
        {d.error && (
          <span role="alert" className="truncate text-[11px] text-destructive" title={d.error.message}>
            {d.error.message}
          </span>
        )}
      </div>
    </div>
  )
}
