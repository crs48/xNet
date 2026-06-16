/**
 * Universal activity timeline (exploration 0190). The CRM `Activity` schema is
 * a polymorphic, append-only engagement log (`about` is its Salesforce `WhatId`,
 * `contact` its `WhoId`). This renders the activities pointing at any node as a
 * chronological feed with a quick composer — so a Deal, Organization, or any
 * other node gets the same Salesforce-style timeline the Contact detail has.
 */
import { ActivitySchema, ACTIVITY_KINDS, type ActivityKind } from '@xnetjs/data'
import { useIdentity, useMutate, useQuery } from '@xnetjs/react'
import { useState, type JSX } from 'react'

interface ActivityRow {
  id: string
  kind?: unknown
  about?: unknown
  contact?: unknown
  summary?: unknown
  occurredAt?: unknown
  createdAt?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

export function ActivityTimeline({ aboutId }: { aboutId: string }): JSX.Element {
  const { data } = useQuery(ActivitySchema, { orderBy: { createdAt: 'desc' }, limit: 500 })
  const { create } = useMutate()
  const { identity } = useIdentity()
  const [kind, setKind] = useState<ActivityKind>('note')
  const [text, setText] = useState('')

  const activities = ((data ?? []) as ActivityRow[])
    .filter((a) => str(a.about) === aboutId || str(a.contact) === aboutId)
    .sort(
      (a, b) =>
        (num(b.occurredAt) ?? num(b.createdAt) ?? 0) - (num(a.occurredAt) ?? num(a.createdAt) ?? 0)
    )

  const log = async (): Promise<void> => {
    const summary = text.trim()
    if (!summary) return
    await create(ActivitySchema, {
      kind,
      about: aboutId,
      summary,
      occurredAt: Date.now(),
      owner: identity?.did
    })
    setText('')
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Activity kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ActivityKind)}
          className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-1 text-[11px] text-ink-2"
        >
          {ACTIVITY_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void log()
          }}
          placeholder="Log a call, note, meeting…"
          className="flex-1 rounded-sm border border-hairline bg-surface-1 px-2 py-1 text-ink-1 outline-none"
        />
        <button
          type="button"
          onClick={() => void log()}
          disabled={!text.trim()}
          className="rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-1 hover:bg-accent disabled:opacity-40"
        >
          Log
        </button>
      </div>
      {activities.length === 0 ? (
        <p className="text-ink-3">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {activities.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-3">
                {str(a.kind) || 'note'}
              </span>
              <span className="min-w-0 flex-1 text-ink-1">{str(a.summary)}</span>
              <span className="shrink-0 text-[10px] text-ink-3">
                {new Date(num(a.occurredAt) ?? num(a.createdAt) ?? Date.now()).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
