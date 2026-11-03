import { Shield, X, Flag, MoreHorizontal, EyeOff, UserRoundX, Ban, RotateCcw } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  api,
  errorText,
  type Item,
  type Preferences,
  type Room,
  type Message,
  type ReportInput,
  type ModerationCase,
  type Notice,
  type CaseList,
  type Policy
} from './api'

const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`
const date = (value: number) => new Date(value * 1000).toLocaleString()
const labels: Record<string, string> = {
  no_action: 'No violation found',
  remove: 'Content restricted',
  restrict_author: 'Participation restricted',
  restore: 'Access restored'
}
export function SafetyDialog({
  title,
  close,
  children
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.showModal()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className="safety-dialog" onCancel={close} aria-labelledby={heading}>
      <div className="dialog-head">
        <h2 id={heading}>{title}</h2>
        <button className="icon-button" aria-label="Close safety dialog" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export type ReportTarget = { item: Item } | { message: Message; room: Room; messages: Message[] }
export function ContentControls({
  id,
  author,
  name,
  onReport,
  changed
}: {
  id: string
  author: string
  name: string
  onReport: () => void
  changed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = async (key: 'hidden' | 'muted_authors' | 'blocked_contacts', value: string) => {
    setBusy(true)
    setError('')
    try {
      const { preferences } = await api<{ preferences: Preferences }>({ op: 'snapshot' })
      await api({
        op: 'preferences',
        preferences: { ...preferences, [key]: [...new Set([...preferences[key], value])] }
      })
      changed()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="content-controls">
      <details>
        <summary aria-label={`Controls for ${name}`}>
          <MoreHorizontal size={16} />
          <span className="sr-only">Content controls</span>
        </summary>
        <div className="content-menu">
          <button disabled={busy} onClick={() => void change('hidden', id)}>
            <EyeOff size={14} />
            Hide from me
          </button>
          <button disabled={busy} onClick={() => void change('muted_authors', author)}>
            <UserRoundX size={14} />
            Mute this person
          </button>
          <button disabled={busy} onClick={() => void change('blocked_contacts', author)}>
            <Ban size={14} />
            Block contact
          </button>
          <button disabled={busy} onClick={onReport}>
            <Flag size={14} />
            Report a problem
          </button>
          <small>Personal controls can be undone in Safety.</small>
        </div>
      </details>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </div>
  )
}
export function ReportDialog({
  target,
  close,
  submitted
}: {
  target: ReportTarget
  close: () => void
  submitted: () => void
}) {
  const privateReport = 'message' in target
  const [category, setCategory] = useState('harassment')
  const [details, setDetails] = useState('')
  const [destination, setDestination] = useState('room')
  const [selected, setSelected] = useState(privateReport ? [target.message.payload.id] : [])
  const [preview, setPreview] = useState<{
    report: ReportInput
    destination: string
    confirmation: string
  } | null>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (preview) {
      previewHeading.current?.focus()
      previewHeading.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [preview])
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(false)
  const invalidate = () => {
    setPreview(null)
    setConsent(false)
    setError('')
  }
  const index = privateReport
    ? target.messages.findIndex((m) => m.payload.id === target.message.payload.id)
    : 0
  const candidates = privateReport ? target.messages.slice(Math.max(0, index - 2), index + 3) : []
  const payload = privateReport
    ? {
        room: target.room.id,
        target: target.message.payload.id,
        selected,
        category,
        details,
        destination
      }
    : null
  async function submit() {
    setBusy(true)
    setError('')
    try {
      if (privateReport) {
        if (!preview) {
          setPreview(await api({ op: 'report_preview', ...payload }))
          return
        }
        if (!consent) return
        await api({ op: 'report_messages', ...payload, confirmation: preview.confirmation })
      } else
        await api({ op: 'report_public', id: target.item.record.payload.id, category, details })
      setReceipt(true)
      submitted()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <SafetyDialog title={receipt ? 'Report received' : 'Report a problem'} close={close}>
      {receipt ? (
        <>
          <p>
            Your report is saved with the chosen reviewers. A report does not automatically remove
            content.
          </p>
          <p className="muted">
            Follow its progress in Safety &amp; moderation. You can also hide the content or block
            contact separately.
          </p>
          <button className="button primary" onClick={close}>
            Done
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {!preview && (
            <>
              <p className="muted">
                {privateReport
                  ? 'Choose the messages a reviewer will see. The rest of the conversation stays out of this report.'
                  : 'This report goes to the registry’s moderators. It includes the public item and your explanation.'}
              </p>
              <label>
                What happened?
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value)
                    invalidate()
                  }}
                >
                  <option value="harassment">Harassment or unwanted contact</option>
                  <option value="privacy">Private information or lack of consent</option>
                  <option value="spam">Spam or manipulation</option>
                  <option value="safety">Serious safety concern</option>
                  <option value="community">Community rules</option>
                </select>
              </label>
              <label>
                Your explanation
                <textarea
                  value={details}
                  maxLength={1000}
                  required
                  placeholder="Help the reviewer understand the context."
                  onChange={(e) => {
                    setDetails(e.target.value)
                    invalidate()
                  }}
                />
              </label>
              {privateReport && (
                <>
                  <fieldset>
                    <legend>Messages to disclose (up to five)</legend>
                    {candidates.map((m) => (
                      <label className="evidence-choice" key={m.payload.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(m.payload.id)}
                          disabled={m.payload.id === target.message.payload.id}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, m.payload.id]
                                : selected.filter((id) => id !== m.payload.id)
                            )
                            invalidate()
                          }}
                        />
                        <span>
                          <strong>{m.payload.name}</strong>
                          <small>{date(m.payload.created)}</small>
                          <span>{m.payload.body}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    Recipient
                    <select
                      value={destination}
                      onChange={(e) => {
                        setDestination(e.target.value)
                        invalidate()
                      }}
                    >
                      <option value="room">This room’s owner and moderators</option>
                      <option value="registry">Registry moderators</option>
                    </select>
                  </label>
                  <p className="small muted">
                    {destination === 'room'
                      ? 'Room moderators can act inside this room.'
                      : 'Registry moderators can restrict their public service; they cannot remove messages from this private room.'}{' '}
                    Authors, text, times, room identity and signatures are disclosed. No
                    attachments, other history, member list or decryption keys are included.
                    Excerpts may identify you.
                  </p>
                </>
              )}
            </>
          )}
          {preview && (
            <div className="disclosure-preview">
              <h3 tabIndex={-1} ref={previewHeading}>
                Review this disclosure
              </h3>
              <p>
                <strong>{preview.report.category}</strong> · {preview.report.details}
              </p>
              <p>
                To:{' '}
                {preview.destination === 'room'
                  ? 'Room owner and moderators'
                  : 'Registry moderators'}
              </p>
              {preview.report.evidence.map((m) => (
                <blockquote key={m.payload.id}>
                  <strong>{m.payload.name}</strong>
                  <small>{date(m.payload.created)}</small>
                  <p>{m.payload.body}</p>
                </blockquote>
              ))}
              <p className="small">
                Report evidence is encrypted in the recipient’s database and expires after 30 days
                and is cleared on the next case access. Their device has its decryption key. This
                does not make the current chat protocol end-to-end encrypted against its room owner.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>Send these excerpts and my explanation to this recipient.</span>
              </label>
            </div>
          )}
          {preview && (
            <button className="button" type="button" disabled={busy} onClick={invalidate}>
              Back to selection
            </button>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary wide"
            disabled={busy || !details.trim() || (!!preview && !consent)}
          >
            {busy ? 'Working…' : privateReport && !preview ? 'Preview disclosure' : 'Send report'}
          </button>
        </form>
      )}
    </SafetyDialog>
  )
}

type CaseEntry = ModerationCase | Notice
function CaseCard({
  entry,
  canReview,
  self,
  scope,
  execute
}: {
  entry: CaseEntry
  canReview: boolean
  self: string
  scope: string
  execute: (command: object) => Promise<void>
}) {
  const [action, setAction] = useState(entry.decisions.length ? 'restore' : 'no_action')
  const [reason, setReason] = useState('')
  const [rule, setRule] = useState('Community rules')
  const [seconds, setSeconds] = useState('86400')
  const [appeal, setAppeal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const report = 'report' in entry ? entry.report : null
  const subject = report ? report.subject : (entry as Notice).subject
  const latest = entry.decisions.at(-1)
  const pending = latest && entry.appeals.some((a) => a.decision_id === latest.id)
  const ownAppeal =
    latest && entry.appeals.some((a) => a.author === self && a.decision_id === latest.id)
  const canAppeal =
    !!latest &&
    (subject.author === self || ('reporter' in entry && entry.reporter === self)) &&
    !ownAppeal
  const invoke = async (command: object) => {
    setBusy(true)
    setError('')
    try {
      await execute(command)
      setReason('')
      setAppeal('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="case-card">
      <summary>
        <span>
          <strong>{subject.title}</strong>
          <small>
            {pending
              ? 'Appeal awaiting review'
              : latest
                ? latest.until && latest.until <= Date.now() / 1000
                  ? 'Restriction expired'
                  : labels[latest.action]
                : 'Awaiting review'}
          </small>
        </span>
        <span className="case-id">{short(entry.id)}</span>
      </summary>
      {report && (
        <>
          <p>
            <strong>{report.category}</strong> · {report.details}
          </p>
          {report.evidence.length > 0 && (
            <details className="evidence-review">
              <summary>View selected evidence ({report.evidence.length})</summary>
              {report.evidence.map((m) => (
                <blockquote key={m.payload.id}>
                  <strong>{m.payload.name}</strong>
                  <small>{date(m.payload.created)}</small>
                  <p>{m.payload.body}</p>
                </blockquote>
              ))}
            </details>
          )}
        </>
      )}
      <ol className="decision-history">
        {entry.decisions.map((d) => (
          <li key={d.id}>
            <strong>{labels[d.action]}</strong>
            <p>{d.reason}</p>
            <small>
              {d.rule} · {date(d.created)} · reviewer {short(d.actor)}
              {d.until ? ` · expires ${date(d.until)}` : ' · no automatic expiry'}
            </small>
          </li>
        ))}
        {entry.appeals.map((a, i) => (
          <li key={`${a.decision_id}-${i}`}>
            <strong>Appeal</strong>
            <p>{a.reason}</p>
            <small>
              {date(a.created)} · {a.author === self ? 'You' : short(a.author)}
            </small>
          </li>
        ))}
      </ol>
      {canReview && report && (
        <form
          className="review-form"
          onSubmit={(e) => {
            e.preventDefault()
            void invoke({
              action: 'review',
              case_id: entry.id,
              decision: action,
              reason,
              rule,
              seconds:
                action === 'remove' || action === 'restrict_author'
                  ? seconds
                    ? Number(seconds)
                    : null
                  : null
            })
          }}
        >
          <label>
            Review decision
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {!latest && <option value="no_action">No violation found</option>}
              {(scope !== 'registry' || subject.kind === 'record') &&
                !(subject.kind === 'record' && subject.room) && (
                  <option value="remove">Restrict this content in this space</option>
                )}
              <option value="restrict_author">Restrict this person in this space</option>
              {latest && <option value="restore">Reverse this case’s restriction</option>}
            </select>
          </label>
          <label>
            Rule
            <input
              value={rule}
              required
              maxLength={160}
              onChange={(e) => setRule(e.target.value)}
            />
          </label>
          <label>
            Reason shown to the affected person
            <textarea
              value={reason}
              required
              maxLength={500}
              placeholder="Explain the action. Do not include reporter identities or private evidence."
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {(action === 'remove' || action === 'restrict_author') && (
            <label>
              Duration
              <select value={seconds} onChange={(e) => setSeconds(e.target.value)}>
                <option value="3600">One hour</option>
                <option value="86400">One day</option>
                <option value="604800">One week</option>
                <option value="">Until reversed</option>
              </select>
            </label>
          )}
          <p className="small muted">
            This decision applies to{' '}
            {scope === 'registry' ? 'this registry and participating clients' : 'this room'}.
            Existing copies cannot be recalled. Appeals remain available.
          </p>
          <button className="button primary" disabled={busy || !reason.trim() || !rule.trim()}>
            Save decision & notify
          </button>
        </form>
      )}
      {canAppeal && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void invoke({ action: 'appeal', case_id: entry.id, reason: appeal })
          }}
        >
          <label>
            Ask for another review
            <textarea
              maxLength={1000}
              value={appeal}
              required
              onChange={(e) => setAppeal(e.target.value)}
              placeholder="What should the reviewer reconsider?"
            />
          </label>
          <button className="button" disabled={busy || !appeal.trim()}>
            Send appeal
          </button>
        </form>
      )}
      {ownAppeal && (
        <p className="small muted">
          Your appeal is recorded. It will remain here with the decision history.
        </p>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </details>
  )
}
export function Cases({
  data,
  self,
  scope,
  execute
}: {
  data: CaseList
  self: string
  scope: string
  execute: (command: object) => Promise<void>
}) {
  const entries: CaseEntry[] = [
    ...data.cases,
    ...data.notices.filter((n) => !data.cases.some((c) => c.id === n.id))
  ]
  return (
    <>
      <p className="small muted">
        {data.can_review
          ? 'You can review reports in this space. Use a different reviewer for an appeal when one is available.'
          : 'Your submitted reports and decisions affecting you. Other people’s private reports are not shared with you.'}
      </p>
      {entries.length === 0 ? (
        <div className="safety-empty">
          <Shield size={24} />
          <p>No reports or decisions here yet.</p>
        </div>
      ) : (
        entries.map((entry) => (
          <CaseCard
            key={`${scope}-${entry.id}-${entry.decisions.length}-${entry.appeals.length}`}
            entry={entry}
            self={self}
            scope={scope}
            canReview={data.can_review}
            execute={execute}
          />
        ))
      )}
      <div className="actions">
        {data.offset > 0 && (
          <button
            className="button"
            onClick={() =>
              void execute({
                action: scope === 'registry' ? 'list' : 'cases',
                offset: Math.max(0, data.offset - 25)
              })
            }
          >
            Previous cases
          </button>
        )}
        {data.next !== null && (
          <button
            className="button"
            onClick={() =>
              void execute({ action: scope === 'registry' ? 'list' : 'cases', offset: data.next })
            }
          >
            More cases
          </button>
        )}
      </div>
    </>
  )
}
export function SafetyCenter({
  preferences,
  self,
  rooms,
  changed
}: {
  preferences: Preferences
  self: string
  rooms: Room[]
  changed: () => void
}) {
  const [scope, setScope] = useState('registry')
  const [data, setData] = useState<CaseList | null>(null)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [topic, setTopic] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  async function load(nextScope = scope) {
    const version = ++generation.current
    setBusy(true)
    setError('')
    try {
      if (nextScope === 'registry') {
        const v = await api<{ registry: Policy; reports: CaseList }>({ op: 'moderation' })
        if (version === generation.current) {
          setPolicy(v.registry)
          setData(v.reports)
        }
      } else {
        const v = await api<CaseList>({
          op: 'room_action',
          id: nextScope,
          command: { action: 'cases', offset: 0 }
        })
        if (version === generation.current) setData(v)
      }
    } catch (e) {
      if (version === generation.current) setError(errorText(e))
    } finally {
      if (version === generation.current) setBusy(false)
    }
  }
  useEffect(() => {
    setData(null)
    void load(scope)
    return () => {
      generation.current++
    }
  }, [scope])
  const update = async (next: Preferences) => {
    setError('')
    try {
      await api({ op: 'preferences', preferences: next })
      changed()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const execute = async (command: object) => {
    const result = await api<CaseList | object>({
      op: scope === 'registry' ? 'registry_action' : 'room_action',
      ...(scope === 'registry' ? {} : { id: scope }),
      command
    })
    if ('cases' in result && 'can_review' in result) setData(result as CaseList)
    else await load()
    changed()
  }
  return (
    <div className="content safety-center">
      <div className="safety-intro">
        <Shield size={28} />
        <div>
          <h2>Your boundaries. Clear decisions.</h2>
          <p className="muted">
            Choose what reaches you, track reports, and challenge restrictions. These controls still
            work while hosting is paused.
          </p>
        </div>
      </div>
      <section className="safety-section">
        <h3>Your personal controls</h3>
        <p className="small muted">
          These choices affect this device’s experience. They do not remove content from the
          registry or change what your device hosts.
        </p>
        {(
          [
            ['hidden', 'Hidden items'],
            ['muted_authors', 'Muted people'],
            ['blocked_contacts', 'Blocked contacts'],
            ['topics', 'Muted phrases']
          ] as const
        ).map(([key, label]) => (
          <details key={key} className="filter-list">
            <summary>
              {label} <span>{preferences[key].length}</span>
            </summary>
            {preferences[key].length === 0 ? (
              <p className="small muted">None yet.</p>
            ) : (
              preferences[key].map((value) => (
                <div className="filter-row" key={value}>
                  <code>{key === 'topics' ? value : short(value)}</code>
                  <button
                    className="button"
                    onClick={() =>
                      void update({
                        ...preferences,
                        [key]: preferences[key].filter((v) => v !== value)
                      })
                    }
                  >
                    <RotateCcw size={13} />
                    Undo
                  </button>
                </div>
              ))
            )}
          </details>
        ))}
        <form
          className="topic-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (topic.trim()) {
              void update({
                ...preferences,
                topics: [...new Set([...preferences.topics, topic.trim()])]
              })
              setTopic('')
            }
          }}
        >
          <label>
            Mute a phrase
            <input
              value={topic}
              maxLength={80}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="A topic you want a break from"
            />
          </label>
          <button className="button" disabled={!topic.trim()}>
            Mute phrase
          </button>
        </form>
      </section>
      <section className="safety-section">
        <div className="section-heading">
          <h3>Reports &amp; appeals</h3>
          <button className="button" disabled={busy} onClick={() => void load()}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <label>
          Review space
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="registry">Public registry</option>
            {rooms.map((room) => (
              <option value={room.id} key={room.id}>
                {room.title}
                {room.private ? ' · private' : ''}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {data && <Cases data={data} self={self} scope={scope} execute={execute} />}
      </section>
      {policy && (
        <section className="safety-section">
          <h3>This registry’s rules</h3>
          <p>{policy.rules}</p>
          <details>
            <summary>Who has authority?</summary>
            <p className="small">
              {policy.moderators.length
                ? `${policy.moderators.length} configured reviewer(s). Only these device identities can restrict registry content.`
                : 'No reviewer is configured. Reports can be stored, but this registry needs an operator before it can review them.'}
            </p>
            {policy.moderators.map((id) => (
              <code className="identity-code" key={id}>
                {id}
                {id === self ? ' · you' : ''}
              </code>
            ))}
            <p className="small muted">
              Registry authority: {short(policy.registry_id)}. Changes reach connected peers on the
              next policy check, normally within five seconds. Fresh policy is required; an
              unavailable registry can interrupt public streaming.
            </p>
          </details>
        </section>
      )}
    </div>
  )
}

export function RoomManager({
  initial,
  self,
  close,
  changed
}: {
  initial: Room
  self: string
  close: () => void
  changed: () => void
}) {
  const [room, setRoom] = useState(initial)
  const [rules, setRules] = useState(initial.rules)
  const [slow, setSlow] = useState(initial.slow_seconds)
  const [approval, setApproval] = useState(initial.review_new_members)
  const [reason, setReason] = useState('')
  const [data, setData] = useState<CaseList | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const owner = room.owner.id === self
  const moderator = owner || room.moderators.includes(self)
  const load = async () => {
    const [info, cases] = await Promise.all([
      api<Room>({ op: 'room_action', id: room.id, command: { action: 'info' } }),
      api<CaseList>({ op: 'room_action', id: room.id, command: { action: 'cases', offset: 0 } })
    ])
    setRoom(info)
    setRules(info.rules)
    setSlow(info.slow_seconds)
    setApproval(info.review_new_members)
    setData(cases)
  }
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)))
  }, [])
  async function execute(command: object) {
    const result = await api<object>({ op: 'room_action', id: room.id, command })
    if ('cases' in result && 'can_review' in result) setData(result as CaseList)
    else await load()
    changed()
  }
  async function act(command: object, message: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await execute(command)
      setNotice(message)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <SafetyDialog title={room.title} close={close}>
      <p className="muted">
        {room.private ? 'Invitation-only conversation' : 'Public conversation'} ·{' '}
        {room.members.includes(self)
          ? `${room.members.length} members`
          : 'Access limited · reports and appeals available'}
      </p>
      <section className="safety-section">
        <h3>Room rules</h3>
        {moderator ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void act(
                { action: 'settings', rules, slow_seconds: slow, review_new_members: approval },
                'Room settings saved.'
              )
            }}
          >
            <label>
              What makes this a good place?
              <textarea
                value={rules}
                maxLength={2000}
                required
                onChange={(e) => setRules(e.target.value)}
              />
            </label>
            <label>
              Time between messages
              <select value={slow} onChange={(e) => setSlow(Number(e.target.value))}>
                <option value={0}>No delay</option>
                <option value={10}>10 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>One minute</option>
                <option value={300}>Five minutes</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={approval}
                onChange={(e) => setApproval(e.target.checked)}
              />
              <span>Approve new members before they can read or send messages.</span>
            </label>
            <button className="button primary" disabled={busy || !rules.trim()}>
              Save room settings
            </button>
          </form>
        ) : (
          <p>{room.rules}</p>
        )}
      </section>
      {moderator && (
        <section className="safety-section">
          <h3>People &amp; invitations</h3>
          <p className="small muted">
            Only the owner can appoint moderators. Removing someone rotates the invitation and
            records an appealable decision. Existing copies cannot be recalled.
          </p>
          <label>
            Reason for a membership change
            <input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Shown to the person affected"
            />
          </label>
          {room.members.map((id) => (
            <div className="member-row" key={id}>
              <span>
                <code>{short(id)}</code>
                <small>
                  {id === self ? 'You · ' : ''}
                  {id === room.owner.id
                    ? 'Owner'
                    : room.moderators.includes(id)
                      ? 'Moderator'
                      : 'Member'}
                </small>
              </span>
              {id !== room.owner.id && id !== self && (
                <div className="actions">
                  {owner && (
                    <button
                      className="button"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void act(
                          {
                            action: 'member',
                            member: id,
                            role: room.moderators.includes(id) ? 'member' : 'moderator',
                            reason
                          },
                          'Role updated.'
                        )
                      }
                    >
                      {room.moderators.includes(id) ? 'Make member' : 'Make moderator'}
                    </button>
                  )}
                  {(owner || !room.moderators.includes(id)) && (
                    <button
                      className="button"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void act(
                          { action: 'member', member: id, role: 'remove', reason },
                          'Member removed. Their notice and appeal remain available.'
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {room.pending.length > 0 && <h4>Requests to join</h4>}
          {room.pending.map((id) => (
            <div className="member-row" key={id}>
              <code>{short(id)}</code>
              <button
                className="button"
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void act(
                    { action: 'member', member: id, role: 'admit', reason },
                    'Member admitted.'
                  )
                }
              >
                Admit
              </button>
            </div>
          ))}
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void act(
                { action: 'rotate_invite' },
                'Previous invitations are now invalid. Use Invite in the chat to copy a new one.'
              )
            }
          >
            Replace invitation link
          </button>
        </section>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {data && (
        <section className="safety-section">
          <h3>Room reports &amp; appeals</h3>
          <Cases data={data} self={self} scope={room.id} execute={execute} />
        </section>
      )}
      {!owner && (
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const result = await api<{ notice?: string }>({ op: 'leave_room', id: room.id })
              changed()
              if (result.notice) setNotice(result.notice)
              else close()
            } catch (e) {
              setError(errorText(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Leave this conversation
        </button>
      )}
    </SafetyDialog>
  )
}
