/**
 * Contacts surface (exploration 0188) — master/detail. The list groups
 * contacts by lifecycle; the detail edits the core fields, drives the
 * keep-in-touch cadence, and shows the append-only activity timeline. Personal
 * CRM users live entirely here; the pipeline is a separate surface they can
 * ignore.
 */
import { computeNextTouch, daysUntilTouch } from '@xnetjs/crm'
import {
  ActivitySchema,
  CONTACT_LIFECYCLE,
  ContactSchema,
  OrganizationSchema,
  type ActivityKind,
  type ContactLifecycle
} from '@xnetjs/data'
import { useIdentity, useMutate, useQuery } from '@xnetjs/react'
import { cn } from '@xnetjs/ui'
import { CalendarClock, Plus, SlidersHorizontal } from 'lucide-react'
import { useState, type JSX } from 'react'
import { NodePeek } from '../NodeInspector'
import { ContactTools } from './ContactTools'
import { num, relDays, str } from './crm-helpers'

const ACTIVITY_KIND_OPTIONS: Array<{ id: ActivityKind; label: string }> = [
  { id: 'note', label: 'Note' },
  { id: 'call', label: 'Call' },
  { id: 'email', label: 'Email' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'task', label: 'Task' }
]

interface ContactRow {
  id: string
  displayName?: unknown
  lifecycle?: unknown
}

export function CrmContacts(): JSX.Element {
  const { data, loading } = useQuery(ContactSchema, { orderBy: { createdAt: 'desc' } })
  const { create } = useMutate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const contacts = (data ?? []) as ContactRow[]

  const newContact = async () => {
    const node = await create(ContactSchema, { displayName: 'New contact' })
    if (node?.id) setSelectedId(node.id)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col border-r border-hairline">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-ink-2">Contacts</span>
          <button
            type="button"
            aria-label="New contact"
            onClick={() => void newContact()}
            className="rounded-sm p-1 text-ink-3 hover:bg-accent hover:text-ink-1"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
        <ContactTools contacts={contacts} />
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {loading ? (
            <p className="px-2 text-xs text-ink-3">Loading…</p>
          ) : contacts.length === 0 ? (
            <p className="px-2 py-1 text-xs text-ink-3">No contacts yet.</p>
          ) : (
            CONTACT_LIFECYCLE.map((stage) => {
              const group = contacts.filter((c) => (str(c.lifecycle) || 'lead') === stage.id)
              if (group.length === 0) return null
              return (
                <div key={stage.id} className="mb-2">
                  <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
                    {stage.name}
                  </div>
                  {group.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'flex w-full items-center rounded-sm px-2 py-1 text-left text-xs transition-colors',
                        c.id === selectedId
                          ? 'bg-accent text-ink-1'
                          : 'text-ink-2 hover:bg-accent hover:text-ink-1'
                      )}
                    >
                      <span className="truncate">{str(c.displayName) || 'Untitled contact'}</span>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedId ? (
          <ContactDetail key={selectedId} contactId={selectedId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-xs text-sm text-ink-3">
              Select a contact, or create one to start tracking the relationship.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

interface ActivityRow {
  id: string
  kind?: unknown
  contact?: unknown
  summary?: unknown
  occurredAt?: unknown
  createdAt?: unknown
}

function ContactDetail({ contactId }: { contactId: string }): JSX.Element {
  const { data: contact } = useQuery(ContactSchema, contactId)
  const { data: orgsData } = useQuery(OrganizationSchema, { orderBy: { createdAt: 'desc' } })
  const { data: activityData } = useQuery(ActivitySchema, { orderBy: { createdAt: 'desc' } })
  const { update, create } = useMutate()
  const { identity } = useIdentity()

  const [composerKind, setComposerKind] = useState<ActivityKind>('note')
  const [composerText, setComposerText] = useState('')
  const [allFieldsOpen, setAllFieldsOpen] = useState(false)

  if (!contact) return <p className="p-6 text-xs text-ink-3">Loading…</p>

  const orgs = (orgsData ?? []) as Array<{ id: string; name?: unknown }>
  const activities = ((activityData ?? []) as ActivityRow[])
    .filter((a) => str(a.contact) === contactId)
    .sort(
      (a, b) =>
        (num(b.occurredAt) ?? num(b.createdAt) ?? 0) - (num(a.occurredAt) ?? num(a.createdAt) ?? 0)
    )

  const touchEveryDays = num(contact.touchEveryDays)
  const until = daysUntilTouch(
    {
      nextTouchAt: num(contact.nextTouchAt),
      lastTouchAt: num(contact.lastTouchAt),
      touchEveryDays
    },
    Date.now()
  )

  const commit = (patch: Record<string, unknown>) => {
    void update(ContactSchema, contactId, patch as never)
  }

  const logTouch = (extra: Record<string, unknown> = {}) => {
    const now = Date.now()
    commit({
      lastTouchAt: now,
      nextTouchAt: computeNextTouch(now, touchEveryDays ?? null, now) ?? undefined,
      ...extra
    })
  }

  const logActivity = async () => {
    const text = composerText.trim()
    if (!text) return
    await create(ActivitySchema, {
      kind: composerKind,
      contact: contactId,
      summary: text,
      occurredAt: Date.now(),
      owner: identity?.did
    })
    setComposerText('')
    logTouch()
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center gap-2">
        <input
          defaultValue={str(contact.displayName)}
          onBlur={(e) => commit({ displayName: e.target.value })}
          placeholder="Name"
          className="flex-1 border-none bg-transparent text-xl font-semibold text-ink-1 outline-none"
        />
        <button
          type="button"
          onClick={() => setAllFieldsOpen(true)}
          title="Edit all fields"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-2 hover:bg-accent hover:text-ink-1"
        >
          <SlidersHorizontal size={13} strokeWidth={1.5} /> All fields
        </button>
      </div>

      <NodePeek
        schema={ContactSchema}
        nodeId={contactId}
        open={allFieldsOpen}
        onClose={() => setAllFieldsOpen(false)}
        formOptions={{
          highlights: ['displayName', 'email', 'phone', 'title'],
          groups: { firstName: 'Name', lastName: 'Name' }
        }}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Field label="Lifecycle">
          <select
            value={str(contact.lifecycle) || 'lead'}
            onChange={(e) => commit({ lifecycle: e.target.value as ContactLifecycle })}
            className="w-full rounded-sm border border-hairline bg-surface-1 px-2 py-1 text-ink-1"
          >
            {CONTACT_LIFECYCLE.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Company">
          <select
            value={str(contact.org)}
            onChange={(e) => commit({ org: e.target.value || undefined })}
            className="w-full rounded-sm border border-hairline bg-surface-1 px-2 py-1 text-ink-1"
          >
            <option value="">—</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {str(o.name) || 'Untitled'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email">
          <TextField
            defaultValue={str(contact.email)}
            onCommit={(v) => commit({ email: v || undefined })}
          />
        </Field>
        <Field label="Phone">
          <TextField
            defaultValue={str(contact.phone)}
            onCommit={(v) => commit({ phone: v || undefined })}
          />
        </Field>
        <Field label="Title">
          <TextField
            defaultValue={str(contact.title)}
            onCommit={(v) => commit({ title: v || undefined })}
          />
        </Field>
        <Field label="Keep in touch (days)">
          <TextField
            defaultValue={touchEveryDays != null ? String(touchEveryDays) : ''}
            onCommit={(v) => {
              const n = v ? Math.max(0, Math.round(Number(v))) : undefined
              commit({ touchEveryDays: Number.isFinite(n) ? n : undefined })
            }}
          />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => logTouch()}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-1 hover:bg-accent"
        >
          <CalendarClock size={13} strokeWidth={1.5} /> Log touch
        </button>
        {until != null && (
          <span className={cn('text-[11px]', until <= 0 ? 'text-red-500' : 'text-ink-3')}>
            {until <= 0 ? `Overdue (${relDays(until)})` : `Next touch ${relDays(until)}`}
          </span>
        )}
      </div>

      <Field label="How we met" className="mt-3">
        <TextField
          defaultValue={str(contact.howWeMet)}
          onCommit={(v) => commit({ howWeMet: v || undefined })}
        />
      </Field>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium text-ink-2">Activity</h3>
        <div className="mb-3 flex items-center gap-1.5">
          <select
            value={composerKind}
            onChange={(e) => setComposerKind(e.target.value as ActivityKind)}
            className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-1 text-xs text-ink-1"
          >
            {ACTIVITY_KIND_OPTIONS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void logActivity()
            }}
            placeholder="Log a call, note, meeting…"
            className="flex-1 rounded-sm border border-hairline bg-surface-1 px-2 py-1 text-xs text-ink-1 outline-none"
          />
          <button
            type="button"
            onClick={() => void logActivity()}
            className="rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-1 hover:bg-accent"
          >
            Log
          </button>
        </div>
        {activities.length === 0 ? (
          <p className="text-xs text-ink-3">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {activities.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-xs">
                <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-3">
                  {str(a.kind) || 'note'}
                </span>
                <span className="flex-1 text-ink-1">{str(a.summary)}</span>
                <span className="text-[10px] text-ink-3">
                  {new Date(
                    num(a.occurredAt) ?? num(a.createdAt) ?? Date.now()
                  ).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className
}: {
  label: string
  children: JSX.Element
  className?: string
}): JSX.Element {
  return (
    <label className={cn('block', className)}>
      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      {children}
    </label>
  )
}

function TextField({
  defaultValue,
  onCommit
}: {
  defaultValue: string
  onCommit: (value: string) => void
}): JSX.Element {
  return (
    <input
      defaultValue={defaultValue}
      onBlur={(e) => onCommit(e.target.value)}
      className="w-full rounded-sm border border-hairline bg-surface-1 px-2 py-1 text-ink-1 outline-none"
    />
  )
}
