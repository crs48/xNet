/**
 * TimeMachinePanel — scrub any node's history (exploration 0329 P1, the first
 * context tool). Google-Docs-named-versions × Patchwork findings:
 *
 * - change-density minibar over the timeline's wall-time span;
 * - a scrubber bound to the merged Lamport line (`useTimeMachine`), with
 *   ←/→ keyboard steps while the panel is focused;
 * - author color chips (stable DID hash → color, the 0298 presence palette);
 * - named versions: list checkpoints, filter to them, "Name this version";
 * - a compact property diff of the scrubbed state vs current (long prose as
 *   word/sentence counts, removed values revealed on hover);
 * - one-click restore (compensating transaction — undoable), disabled at
 *   latest; an explicit history-horizon note when older changes were
 *   compacted on this device.
 */
import type { ScopeTimelineEntry, UseTimeMachineResult } from '@xnetjs/react'
import { useTimeMachine } from '@xnetjs/react'
import { Bookmark, BookmarkPlus, Clock3, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { colorForDid, displayName } from '../../comms/comms-utils'
import { useEnsureProfiles, useProfiles, type ProfileEntry } from '../../comms/hooks'
import { bucketDensity, bucketIndexFor } from './density'
import { formatValue, longTextDelta } from './diff-format'

const DENSITY_BUCKETS = 40
const VISIBLE_ENTRIES = 30

function formatWhen(wallTime: number): string {
  return new Date(wallTime).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function AuthorChip({ did, profiles }: { did: string; profiles: ProfileEntry[] }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={did}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: colorForDid(did) }}
      />
      <span className="truncate text-[11px] text-ink-2">{displayName(did, profiles)}</span>
    </span>
  )
}

/** Thin horizontal strip: change density by wall time; click to jump. */
function DensityMinibar({
  timeline,
  position,
  onJump
}: {
  timeline: ScopeTimelineEntry[]
  position: number
  onJump: (index: number) => void
}) {
  const buckets = useMemo(
    () =>
      bucketDensity(
        timeline.map((entry) => entry.wallTime),
        DENSITY_BUCKETS
      ),
    [timeline]
  )
  if (buckets.length === 0) return null

  const max = Math.max(...buckets.map((b) => b.count))
  const activeBucket =
    timeline[position] !== undefined ? bucketIndexFor(buckets, timeline[position].wallTime) : -1

  return (
    <div
      className="flex h-5 items-end gap-px"
      role="img"
      aria-label="Change density over time"
      data-testid="tm-density"
    >
      {buckets.map((bucket, i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          disabled={bucket.count === 0}
          onClick={() => bucket.firstIndex >= 0 && onJump(bucket.firstIndex)}
          title={
            bucket.count > 0
              ? `${bucket.count} ${bucket.count === 1 ? 'change' : 'changes'} · ${formatWhen(bucket.start)}`
              : undefined
          }
          className={`min-w-0 flex-1 cursor-pointer rounded-[1px] border-none p-0 ${
            i === activeBucket ? 'bg-ink-1' : bucket.count > 0 ? 'bg-ink-3' : 'bg-surface-2'
          }`}
          style={{
            height: bucket.count === 0 ? 2 : Math.max(3, Math.round((bucket.count / max) * 20)),
            opacity: bucket.count === 0 ? 0.6 : 0.35 + 0.65 * (bucket.count / max)
          }}
        />
      ))}
    </div>
  )
}

function DiffRows({ tm }: { tm: UseTimeMachineResult }) {
  if (tm.atLatest) {
    return (
      <p className="m-0 text-[11px] text-ink-3">
        You are at the latest version. Scrub or pick an entry to compare and restore.
      </p>
    )
  }
  if (tm.diffs.length === 0) {
    return <p className="m-0 text-[11px] text-ink-3">Identical to the current version.</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {tm.diffs.map((diff) => {
        // Hook semantics: before = at scrub position, after = current. Restore
        // brings `before` back, so lead with it.
        const delta = longTextDelta(diff.before, diff.after)
        const marker = diff.type === 'added' ? '+' : diff.type === 'removed' ? '−' : '~'
        return (
          <li
            key={diff.property}
            className="flex min-w-0 items-baseline gap-1.5 text-[11px]"
            // Hover-reveal for values the compact row cannot show in full.
            title={`${diff.property}: ${formatValue(diff.before)} (this version) → ${formatValue(
              diff.after
            )} (current)`}
          >
            <span className="w-3 shrink-0 text-center font-mono text-ink-3">{marker}</span>
            <span className="shrink-0 font-medium text-ink-1">{diff.property}</span>
            {delta ? (
              <span className="truncate text-ink-2">{delta} since this version</span>
            ) : (
              <span className="truncate text-ink-2">
                {formatValue(diff.before)}
                <span className="text-ink-3"> → </span>
                {formatValue(diff.after)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function NameVersionForm({
  onCreate,
  onDone
}: {
  onCreate: (name: string) => Promise<void>
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await onCreate(trimmed)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
        placeholder="Version name…"
        aria-label="Version name"
        className="min-w-0 flex-1 rounded-md border border-hairline bg-island px-2 py-1 text-[12px] text-ink-1 outline-none placeholder:text-ink-3"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={!name.trim() || saving}
        className="shrink-0 cursor-pointer rounded-md border-none bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:cursor-default disabled:opacity-50"
      >
        Save
      </button>
    </div>
  )
}

export function TimeMachinePanel({ nodeId }: { nodeId: string }) {
  const tm = useTimeMachine(nodeId)
  const [namedOnly, setNamedOnly] = useState(false)
  const [naming, setNaming] = useState(false)
  const [restoredAt, setRestoredAt] = useState<number | null>(null)

  const authors = useMemo(
    () => [...new Set(tm.timeline.map((entry) => entry.author as string))],
    [tm.timeline]
  )
  useEnsureProfiles(authors)
  const profiles = useProfiles()

  // Transient "Restored" confirmation.
  useEffect(() => {
    if (restoredAt === null) return
    const timer = setTimeout(() => setRestoredAt(null), 5000)
    return () => clearTimeout(timer)
  }, [restoredAt])

  // Keep the scrubbed row visible while stepping with the keyboard.
  const listRef = useRef<HTMLUListElement | null>(null)
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-tm-active="true"]')
    // jsdom has no scrollIntoView; guard so tests exercise the effect safely.
    active?.scrollIntoView?.({ block: 'nearest' })
  }, [tm.position, namedOnly])

  const current = tm.timeline[tm.position]

  const visibleEntries = useMemo(() => {
    const start = Math.max(0, tm.timeline.length - VISIBLE_ENTRIES)
    return tm.timeline.slice(start).reverse()
  }, [tm.timeline])

  const handleRestore = async () => {
    if (tm.atLatest || !current) return
    const ok = window.confirm(
      `Restore to the version from ${formatWhen(current.wallTime)}? ` +
        'This adds a new change (undoable) — nothing in the history is rewritten.'
    )
    if (!ok) return
    const result = await tm.restore()
    if (result) setRestoredAt(Date.now())
  }

  if (tm.changeCount === 0) {
    return (
      <div className="p-3 text-[11px] text-ink-3">
        {tm.loading ? 'Loading history…' : 'No history recorded for this item yet.'}
      </div>
    )
  }

  return (
    <div
      tabIndex={0}
      data-testid="time-machine"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          tm.stepBack()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          tm.stepForward()
        }
      }}
      className="flex h-full flex-col gap-3 p-3 outline-none"
    >
      {/* Header: change count + name-this-version */}
      <div className="flex items-center gap-2">
        <Clock3 size={13} strokeWidth={1.75} className="shrink-0 text-ink-3" />
        <span className="flex-1 text-[11px] text-ink-2">
          {tm.changeCount} {tm.changeCount === 1 ? 'change' : 'changes'}
          {tm.docSnapshotCount ? ` · ${tm.docSnapshotCount} document snapshots` : ''}
        </span>
        {!naming && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-hairline bg-transparent px-1.5 py-0.5 text-[11px] text-ink-2 hover:bg-background-muted hover:text-ink-1"
          >
            <BookmarkPlus size={12} strokeWidth={1.75} />
            Name this version
          </button>
        )}
      </div>

      {naming && (
        <NameVersionForm
          onCreate={async (name) => {
            await tm.createNamedVersion(name)
          }}
          onDone={() => setNaming(false)}
        />
      )}

      {/* History horizon — honesty over hidden depth (0329 F3) */}
      {tm.horizon && (
        <p className="m-0 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-ink-3">
          Older history was compacted on this device — the timeline starts{' '}
          {formatWhen(tm.horizon.wallTime)}.
        </p>
      )}

      {/* Density minibar + scrubber */}
      <div className="flex flex-col gap-1">
        <DensityMinibar timeline={tm.timeline} position={tm.position} onJump={tm.setPosition} />
        <input
          type="range"
          min={0}
          max={Math.max(0, tm.changeCount - 1)}
          value={tm.position}
          onChange={(e) => tm.setPosition(Number(e.target.value))}
          aria-label="Scrub history"
          className="w-full cursor-pointer accent-ink-1"
        />
        {current && (
          <div className="flex items-center gap-2 text-[11px] text-ink-3">
            <span className="shrink-0 font-mono">
              {tm.position + 1}/{tm.changeCount}
            </span>
            <span className="shrink-0">{formatWhen(current.wallTime)}</span>
            <span className="min-w-0 flex-1" />
            <AuthorChip did={current.author as string} profiles={profiles} />
          </div>
        )}
      </div>

      {/* Named-versions toggle */}
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-2">
        <input
          type="checkbox"
          checked={namedOnly}
          onChange={(e) => setNamedOnly(e.target.checked)}
          className="cursor-pointer"
        />
        Named versions only
        {tm.checkpoints.length > 0 && (
          <span className="font-mono text-ink-3">{tm.checkpoints.length}</span>
        )}
      </label>

      {/* Timeline entries / named versions */}
      <ul
        ref={listRef}
        className="m-0 flex max-h-48 min-h-0 list-none flex-col gap-px overflow-y-auto p-0"
      >
        {namedOnly
          ? tm.checkpoints.map((checkpoint) => {
              const index = tm.positionOfCheckpoint(checkpoint)
              const active = index !== null && index === tm.position
              return (
                <li key={checkpoint.id}>
                  <button
                    type="button"
                    data-tm-active={active || undefined}
                    disabled={index === null}
                    onClick={() => index !== null && tm.setPosition(index)}
                    title={
                      index === null
                        ? 'This version is below the compacted history horizon'
                        : (checkpoint.properties.note as string | undefined)
                    }
                    className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md border-none px-1.5 py-1 text-left text-[11px] disabled:cursor-default disabled:opacity-50 ${
                      active
                        ? 'bg-accent text-ink-1'
                        : 'bg-transparent text-ink-2 hover:bg-background-muted'
                    }`}
                  >
                    <Bookmark size={11} strokeWidth={1.75} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {String(checkpoint.properties.name ?? 'Unnamed version')}
                    </span>
                    <span className="shrink-0 text-ink-3">{formatWhen(checkpoint.createdAt)}</span>
                  </button>
                </li>
              )
            })
          : visibleEntries.map((entry) => {
              const active = entry.index === tm.position
              return (
                <li key={entry.change.hash}>
                  <button
                    type="button"
                    data-tm-active={active || undefined}
                    onClick={() => tm.setPosition(entry.index)}
                    className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md border-none px-1.5 py-1 text-left text-[11px] ${
                      active
                        ? 'bg-accent text-ink-1'
                        : 'bg-transparent text-ink-2 hover:bg-background-muted'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForDid(entry.author as string) }}
                      title={displayName(entry.author as string, profiles)}
                    />
                    <span className="shrink-0 capitalize">{entry.operation}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-3">
                      {entry.properties.join(', ')}
                    </span>
                    <span className="shrink-0 text-ink-3">{formatWhen(entry.wallTime)}</span>
                  </button>
                </li>
              )
            })}
        {namedOnly && tm.checkpoints.length === 0 && (
          <li className="px-1.5 py-1 text-[11px] text-ink-3">
            No named versions yet — scrub anywhere and “Name this version”.
          </li>
        )}
      </ul>

      {/* Preview: what this version changes vs current */}
      <div className="flex min-h-0 flex-col gap-1.5 border-t border-hairline pt-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
          This version vs current
        </span>
        <DiffRows tm={tm} />
      </div>

      {/* Restore */}
      <div className="mt-auto flex items-center gap-2 border-t border-hairline pt-2">
        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={tm.atLatest}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-transparent px-2 py-1 text-[12px] font-medium text-ink-1 hover:bg-background-muted disabled:cursor-default disabled:opacity-40"
        >
          <RotateCcw size={13} strokeWidth={1.75} />
          Restore this version
        </button>
        {restoredAt !== null && (
          <span role="status" className="text-[11px] text-ink-2">
            Restored — the previous state is one undo away.
          </span>
        )}
        {tm.error && (
          <span role="alert" className="truncate text-[11px] text-ink-3" title={tm.error.message}>
            {tm.error.message}
          </span>
        )}
      </div>
    </div>
  )
}
