import type { SharedExtension } from './extension-versions'
import type { CommunityAgents } from './use-community-agents'
import type { CommunityData, Conversation } from './use-community-data'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { GitBranch, History, Bot, Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  acceptedDevelopmentHeads,
  captureDevelopmentInput,
  developmentAncestry,
  developmentMessage,
  developmentRelationIssue,
  type DevelopmentEntry,
  type DevelopmentRecord
} from './extension-development'
import { sourceChangeSummary } from './extension-versions'
import { inputClass, primaryButton, secondaryButton } from './primitives'
import { useDevelopmentRecords } from './use-development-records'

export async function publishDevelopment(
  data: CommunityData,
  channel: string,
  content: string,
  record: DevelopmentRecord
) {
  if (!data.did || !data.bridge?.get) throw new Error('Your workspace is not ready.')
  const message = await developmentMessage(data.did, channel, content, record)
  if (!(await data.bridge.get(message.id)))
    await data.bridge.create(ChatMessageSchema, message.properties, message.id)
  return message.id
}
type Props = {
  data: CommunityData
  agents: CommunityAgents
  channel: Conversation
  onSettings: () => void
  onPreview: (version: SharedExtension, project: string, entry: string) => void
  editBase?: { project: string; version: string; nonce: number } | null
  selectedProject: string
  onSelectProject: (id: string) => void
}
export function ExtensionProjects(props: Props) {
  const projects = useDevelopmentRecords({ channel: props.channel.id, developmentKind: 'project' })
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const project = projects.entries.find((entry) => entry.id === props.selectedProject)
  const hasAccess = props.channel.space
    ? props.data.members.some(
        (member) =>
          member.space === props.channel.space &&
          member.member === props.data.did &&
          ['member', 'admin', 'owner'].includes(member.role ?? '') &&
          (!member.expiresAt || member.expiresAt > Date.now())
      ) &&
      (!props.channel.members?.length || props.channel.members.includes(props.data.did!))
    : props.channel.createdBy === props.data.did
  if (!hasAccess)
    return (
      <p role="alert" className="p-6 text-sm">
        Your current membership does not allow this development conversation.
      </p>
    )
  return (
    <section aria-label="Shared extension projects" className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Build together</h2>
        <button className={secondaryButton} onClick={() => setCreating(!creating)}>
          <Plus size={14} />
          New extension
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        One conversation, shared versions, your own data permissions.
      </p>
      {creating && (
        <form
          className="space-y-3 rounded-xl border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            setError('')
            void publishDevelopment(props.data, props.channel.id, 'Started extension: ' + title, {
              kind: 'project',
              title,
              brief,
              nonce: crypto.randomUUID()
            })
              .then((id) => {
                props.onSelectProject(id)
                setCreating(false)
                setTitle('')
                setBrief('')
              })
              .catch((cause: unknown) => setError(String(cause)))
              .finally(() => setBusy(false))
          }}
        >
          <label className="block text-xs">
            Extension name
            <input
              required
              aria-label="Shared extension name"
              className={inputClass}
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block text-xs">
            What are we building?
            <textarea
              aria-label="Extension brief"
              className={inputClass}
              maxLength={4000}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
            />
          </label>
          <button className={primaryButton} disabled={busy || !title.trim()}>
            Create shared extension
          </button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {projects.entries.map((entry) => (
          <button
            key={entry.id}
            className={secondaryButton}
            aria-pressed={entry.id === project?.id}
            onClick={() => props.onSelectProject(entry.id)}
          >
            <GitBranch size={14} />
            {entry.record.kind === 'project' ? entry.record.title : ''}
          </button>
        ))}
      </div>
      {projects.limited && (
        <button className={secondaryButton} onClick={projects.loadMore}>
          Load earlier projects
        </button>
      )}
      {(error || projects.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || projects.error}
        </p>
      )}
      {project ? (
        <ProjectThread key={project.id} {...props} project={project} />
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          Create an extension or choose a project to see its conversation and versions.
        </p>
      )}
    </section>
  )
}
function ProjectThread({
  project,
  data,
  agents,
  channel,
  onSettings,
  onPreview,
  editBase
}: Props & { project: DevelopmentEntry }) {
  const records = useDevelopmentRecords({ channel: channel.id, developmentProject: project.id })
  const [messageLimit, setMessageLimit] = useState(100)
  const messages = useQuery(ChatMessageSchema, {
    where: { channel: channel.id, inReplyTo: project.id },
    orderBy: { createdAt: 'desc' },
    limit: messageLimit
  })
  const draftKey = `xnet:development-draft:${data.did}:${project.id}`
  const [draft, setDraft] = useState(() => localStorage.getItem(draftKey) ?? '')
  useEffect(() => {
    localStorage.setItem(draftKey, draft)
  }, [draftKey, draft])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hostId, setHostId] = useState('')
  const [people, setPeople] = useState<string[]>([])
  const [parents, setParents] = useState<string[]>([])
  useEffect(() => {
    if (editBase?.project === project.id) {
      setParents([editBase.version])
      setDraft((old) => old || '@Codex ')
    }
  }, [editBase, project.id])
  const [historyId, setHistoryId] = useState('')
  const [fromBeginning, setFromBeginning] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const entries = records.entries
  const versions = entries.filter((entry) => entry.record.kind === 'version')
  const heads = acceptedDevelopmentHeads(project, entries)
  const accepted =
    heads.heads.length === 1 && heads.heads[0].record.kind === 'accept'
      ? heads.heads[0].record.version
      : ''
  const versionNumber = (id: string) => {
    const index = versions.findIndex((entry) => entry.id === id)
    return index < 0 ? 'Missing version' : 'v' + (index + 1)
  }
  const offers = useMemo(() => {
    const latest = new Map<string, DevelopmentEntry>()
    for (const entry of entries) if (entry.record.kind === 'host') latest.set(entry.author, entry)
    return [...latest.values()].filter(
      (entry) =>
        entry.record.kind === 'host' &&
        entry.record.expiresAt > Date.now() &&
        entry.record.requesters.includes(data.did ?? '')
    )
  }, [entries, data.did])
  const host = offers.find((entry) => entry.author === hostId) ?? offers[0]
  const binding = agents.snapshot.bindings.find(
    (entry) => entry.channelId === channel.id && entry.enabled
  )
  const runtimeReady = agents.snapshot.runtimes.some(
    (runtime) => runtime.id === binding?.runtimeId && runtime.state === 'ready'
  )
  const localGrant = agents.snapshot.delegations?.find(
    (entry) => entry.projectId === project.id && entry.expiresAt > Date.now()
  )
  const collaborators = [
    ...new Set(
      data.members
        .filter(
          (member) =>
            member.space === channel.space &&
            ['member', 'admin', 'owner'].includes(member.role ?? '') &&
            (!member.expiresAt || member.expiresAt > Date.now())
        )
        .map((member) => member.member)
    )
  ].filter(
    (id): id is NonNullable<typeof id> =>
      !!id && id !== data.did && (!channel.members?.length || channel.members.includes(id))
  )
  const perform = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }
  const chosen = parents.length ? parents : accepted ? [accepted] : []
  const requestEntries = entries.filter((entry) => entry.record.kind === 'request')
  const latestAttempt = (id: string) =>
    entries
      .filter(
        (entry) =>
          entry.record.kind === 'attempt' &&
          entry.record.request === id &&
          !developmentRelationIssue(entry, entries)
      )
      .at(-1)
  const withdrawn = new Set(
    entries.flatMap((entry) => {
      const record = entry.record
      return record.kind === 'withdraw' &&
        requestEntries.some(
          (request) => request.id === record.request && request.author === entry.author
        )
        ? [record.request]
        : []
    })
  )
  const history = historyId
    ? developmentAncestry(historyId, entries)
    : { versions: [], missing: [] }
  const displayedHistory = fromBeginning
    ? history.versions
    : history.versions.filter((entry) => entry.id === historyId)
  const contextCandidates = [...messages.data]
    .reverse()
    .filter(
      (message) =>
        !message.redacted &&
        !withdrawn.has(message.id) &&
        !['attempt', 'host', 'accept', 'withdraw'].includes(message.developmentKind ?? '')
    )
    .slice(-24)
  const selectedContext = contextCandidates.filter(
    (message) => !excludedContext.includes(message.id)
  )
  const send = () =>
    perform(async () => {
      if (!data.bridge || !draft.trim()) return
      if (/^@(codex|claude)\b/i.test(draft.trim())) {
        if (!host || host.record.kind !== 'host')
          throw new Error('A collaborator must allow requests from their local agent first.')
        const context = await Promise.all(
          selectedContext.map(async (message) => {
            const node = await data.bridge!.get!(message.id)
            if (
              !node ||
              node.deleted ||
              node.properties.redacted ||
              node.properties.inReplyTo !== project.id
            )
              throw new Error(
                'Selected context is no longer available. Review the selected messages.'
              )
            return captureDevelopmentInput(node)
          })
        )
        await publishDevelopment(data, channel.id, draft.trim(), {
          kind: 'request',
          project: project.id,
          host: host.author,
          epoch: host.record.epoch,
          parents: chosen,
          contextIds: context.map((message) => message.id),
          contextDigests: context.map((message) => message.digest)
        })
      } else
        await publishDevelopment(data, channel.id, draft.trim(), {
          kind: 'feedback',
          project: project.id,
          parents: chosen
        })
      setDraft('')
    })
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-medium">
          {project.record.kind === 'project' ? project.record.title : ''}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
          {project.record.kind === 'project' ? project.record.brief : ''}
        </p>
        <p className="mt-2 text-xs">
          {accepted
            ? 'Current shared version: ' + versionNumber(accepted)
            : heads.heads.length > 1
              ? 'Competing current versions — choose a version to resolve them.'
              : 'No shared version accepted yet.'}
        </p>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer">Agent hosting and permissions</summary>
          <p className="my-3 text-muted-foreground">
            Allow named people to use your provider account for 20 requests over one hour. Only this
            project's shared conversation and selected code are sent. Each run starts with explicit
            fresh context.
          </p>
          {collaborators.map((id) => (
            <label key={id} className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={people.includes(id)}
                onChange={(event) =>
                  setPeople((old) =>
                    event.target.checked ? [...old, id] : old.filter((value) => value !== id)
                  )
                }
              />
              {data.nameFor(id)}
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                if (!binding || !runtimeReady) {
                  onSettings()
                  return
                }
                void perform(async () => {
                  if (!agents.port) throw new Error('Open Electron to host an agent.')
                  const grant = await agents.port.delegate({
                    projectId: project.id,
                    channelId: channel.id,
                    requesters: people,
                    expiresAt: Date.now() + 3600000,
                    limit: 20
                  })
                  await publishDevelopment(
                    data,
                    channel.id,
                    'Agent hosting enabled for this extension.',
                    {
                      kind: 'host',
                      project: project.id,
                      epoch: grant.epoch,
                      expiresAt: grant.expiresAt,
                      requesters: grant.requesters,
                      limit: grant.limit
                    }
                  )
                })
              }}
            >
              <Bot size={14} />
              {runtimeReady ? 'Allow selected people and host' : 'Connect my agent'}
            </button>
            {localGrant && (
              <button
                className={secondaryButton}
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await agents.port!.revokeDelegation(project.id)
                    await publishDevelopment(data, channel.id, 'Agent hosting stopped.', {
                      kind: 'host',
                      project: project.id,
                      epoch: localGrant.epoch,
                      expiresAt: 0,
                      requesters: [],
                      limit: 20
                    })
                  })
                }
              >
                Stop hosting and revoke
              </button>
            )}
          </div>
        </details>
      </div>
      <div className="space-y-2" aria-label="Shared extension versions">
        <h3 className="text-sm font-medium">Versions</h3>
        {!versions.length && (
          <p className="text-xs text-muted-foreground">
            Ask your agent to build the first version.
          </p>
        )}
        {versions.map(
          (version) =>
            version.record.kind === 'version' && (
              <article key={version.id} className="rounded-xl border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranch size={14} />
                  <strong>
                    {versionNumber(version.id)} · {version.record.extension.title}
                  </strong>
                  <span className="text-muted-foreground">
                    {data.nameFor(version.author)}
                    {version.id === accepted ? ' · current' : ''}
                  </span>
                </div>
                <p className="my-2">{version.record.extension.changeNote}</p>
                <p className="mb-2 text-muted-foreground">
                  {version.record.parents.length
                    ? 'From ' + version.record.parents.map(versionNumber).join(' + ')
                    : 'Initial version'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={secondaryButton}
                    onClick={() => {
                      if (version.record.kind === 'version')
                        onPreview(version.record.extension, project.id, version.id)
                    }}
                  >
                    Try this version
                  </button>
                  <button
                    className={secondaryButton}
                    onClick={() => {
                      setParents([version.id])
                      setDraft('@Codex ')
                    }}
                  >
                    Start from here
                  </button>
                  <button
                    className={secondaryButton}
                    aria-pressed={historyId === version.id}
                    onClick={() => setHistoryId(historyId === version.id ? '' : version.id)}
                  >
                    <History size={13} />
                    How this version was made
                  </button>
                  {project.author === data.did && (
                    <button
                      className={secondaryButton}
                      disabled={busy || version.id === accepted || heads.unresolved > 0}
                      onClick={() =>
                        void perform(() =>
                          publishDevelopment(
                            data,
                            channel.id,
                            'Accepted ' + versionNumber(version.id),
                            {
                              kind: 'accept',
                              project: project.id,
                              version: version.id,
                              previous: heads.heads.map((entry) => entry.id)
                            }
                          )
                        )
                      }
                    >
                      {heads.heads.length > 1 ? 'Resolve with this version' : 'Make current'}
                    </button>
                  )}
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={parents.includes(version.id)}
                      onChange={(event) =>
                        setParents((old) =>
                          event.target.checked
                            ? [...old, version.id].slice(-4)
                            : old.filter((id) => id !== version.id)
                        )
                      }
                    />
                    Include as base
                  </label>
                </div>
              </article>
            )
        )}
      </div>
      {historyId && (
        <section
          aria-label="Extension development history"
          className="space-y-3 rounded-xl border border-border p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-sm font-semibold">
              How {versionNumber(historyId)} was made
            </h3>
            <button
              className={secondaryButton}
              aria-pressed={!fromBeginning}
              onClick={() => setFromBeginning(false)}
            >
              This update
            </button>
            <button
              className={secondaryButton}
              aria-pressed={fromBeginning}
              onClick={() => setFromBeginning(true)}
            >
              From the beginning
            </button>
          </div>
          {history.missing.length > 0 && (
            <p role="status" className="text-xs">
              History incomplete: {history.missing.length} ancestor versions unavailable. Load
              earlier records or wait for sync.
            </p>
          )}
          {displayedHistory.map((version) => (
            <VersionHistory
              key={version.id}
              version={version}
              data={data}
              channel={channel.id}
              label={versionNumber(version.id)}
              issue={developmentRelationIssue(version, entries)}
              parents={versions.filter(
                (parent) =>
                  version.record.kind === 'version' && version.record.parents.includes(parent.id)
              )}
              priorRevisions={
                new Set(
                  displayedHistory
                    .slice(0, displayedHistory.indexOf(version))
                    .flatMap((ancestor) =>
                      ancestor.record.kind === 'version'
                        ? (ancestor.record.history?.inputs.map((input) => input.digest) ?? [])
                        : []
                    )
                )
              }
              priorMessages={
                new Set(
                  displayedHistory
                    .slice(0, displayedHistory.indexOf(version))
                    .map((ancestor) => ancestor.id)
                )
              }
            />
          ))}
          <details className="text-xs">
            <summary className="cursor-pointer">Discussion after this version</summary>
            <p className="my-2 text-muted-foreground">
              Feedback and requests based on this version. These did not create it.
            </p>
            {entries
              .filter(
                (entry) =>
                  (entry.record.kind === 'feedback' || entry.record.kind === 'request') &&
                  entry.record.parents.includes(historyId)
              )
              .map((entry) => (
                <p key={entry.id} className="my-2 whitespace-pre-wrap">
                  <strong>{data.nameFor(entry.author)}:</strong> {entry.content}
                </p>
              ))}
          </details>
          <p className="text-[11px] text-muted-foreground">
            This records published conversation and the host's reported inputs. Rerunning a model
            may produce different code. Code sharing does not include this history automatically.
          </p>
        </section>
      )}
      <div className="space-y-3" aria-label="Extension project conversation">
        <h3 className="text-sm font-medium">Conversation</h3>
        {messages.data.length >= messageLimit && (
          <button
            className={secondaryButton}
            onClick={() => setMessageLimit((value) => value + 100)}
          >
            Load earlier conversation
          </button>
        )}
        {[...messages.data]
          .reverse()
          .filter(
            (message) => !['attempt', 'host', 'accept'].includes(message.developmentKind ?? '')
          )
          .map((message) => {
            const attempt = latestAttempt(message.id)
            const record = entries.find((entry) => entry.id === message.id)
            return (
              <article key={message.id} className="rounded-lg bg-muted/30 p-3 text-sm">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {data.nameFor(message.createdBy)} ·{' '}
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                  {message.developmentKind === 'version' ? ' · published agent result or edit' : ''}
                </p>
                <p className="whitespace-pre-wrap">
                  {message.redacted ? 'Message removed' : message.content}
                </p>
                {record?.record.kind === 'feedback' && record.record.parents.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Feedback on {record.record.parents.map(versionNumber).join(' + ')}
                  </p>
                )}
                {record?.record.kind === 'request' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        attempt?.record.kind === 'attempt' &&
                        ['running', 'queued'].includes(attempt.record.status)
                          ? 'motion-safe:animate-pulse'
                          : ''
                      }
                    >
                      {withdrawn.has(message.id)
                        ? 'Withdrawn'
                        : attempt?.record.kind === 'attempt'
                          ? attempt.record.status +
                            (['running', 'queued'].includes(attempt.record.status) &&
                            attempt.record.phase
                              ? ' · ' + attempt.record.phase
                              : '')
                          : 'Waiting for ' + data.nameFor(record.record.host) + '’s device'}
                    </span>
                    <span className="text-muted-foreground">
                      Host: {data.nameFor(record.record.host)} ·{' '}
                      {record.record.parents.map(versionNumber).join(', ') || 'initial version'}
                    </span>
                    {message.createdBy === data.did &&
                      !withdrawn.has(message.id) &&
                      (!attempt ||
                        (attempt.record.kind === 'attempt' &&
                          ['running', 'queued'].includes(attempt.record.status))) && (
                        <button
                          className="underline"
                          onClick={() =>
                            void perform(() =>
                              publishDevelopment(data, channel.id, 'Request withdrawn', {
                                kind: 'withdraw',
                                project: project.id,
                                request: message.id
                              })
                            )
                          }
                        >
                          Withdraw
                        </button>
                      )}
                    {record.record.host === data.did &&
                      attempt?.record.kind === 'attempt' &&
                      ['failed', 'cancelled', 'interrupted'].includes(attempt.record.status) && (
                        <button
                          className="underline"
                          onClick={() =>
                            void perform(() =>
                              agents.port!.startDevelopment({ requestId: message.id, retry: true })
                            )
                          }
                        >
                          Retry attempt
                        </button>
                      )}
                  </div>
                )}
              </article>
            )
          })}
        <p className="text-[11px] text-muted-foreground">
          Progress is the last report from the host; an offline host may not have sent its final
          status.
        </p>
      </div>
      <form
        className="space-y-2 rounded-xl border border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setDraft((value) => (/^@/i.test(value) ? value : '@Codex ' + value))}
          >
            @Codex
          </button>
          {offers.length > 0 && (
            <label>
              Agent host{' '}
              <select
                aria-label="Extension agent host"
                className="rounded border border-border bg-background p-1"
                value={host?.author ?? ''}
                onChange={(event) => setHostId(event.target.value)}
              >
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.author}>
                    {data.nameFor(offer.author)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span>
            {chosen.map(versionNumber).join(' + ') || 'New extension'} · {selectedContext.length}{' '}
            context messages
          </span>
          {parents.length > 0 && (
            <button type="button" className="underline" onClick={() => setParents([])}>
              Use current version
            </button>
          )}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer">
            Review messages sent to the agent ({selectedContext.length})
          </summary>
          <p className="my-2 text-muted-foreground">
            Choose from the latest 24 project messages. Selected text is frozen when you send.
            Attachments and your private data are excluded.
          </p>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {contextCandidates.map((message) => (
              <label key={message.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={!excludedContext.includes(message.id)}
                  onChange={(event) =>
                    setExcludedContext((old) =>
                      event.target.checked
                        ? old.filter((id) => id !== message.id)
                        : [...old, message.id]
                    )
                  }
                />
                <span>
                  <strong>{data.nameFor(message.createdBy)}:</strong>{' '}
                  {message.content?.slice(0, 300)}
                  {(message.content?.length ?? 0) > 300 ? '…' : ''}
                </span>
              </label>
            ))}
          </div>
        </details>
        <textarea
          aria-label="Message extension project"
          className={inputClass}
          value={draft}
          maxLength={10000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Discuss an idea, or @Codex ask for an update…"
        />
        <div className="flex items-center gap-2">
          <p className="mr-auto text-[11px] text-muted-foreground">
            Mentions request work. Discussion stays in the thread. Requests during a run are queued.
          </p>
          <button disabled={busy || !draft.trim()} className={primaryButton}>
            <Send size={14} />
            Send
          </button>
        </div>
      </form>
      {records.limited && (
        <button className={secondaryButton} onClick={records.loadMore}>
          Load earlier development records
        </button>
      )}
      {heads.unresolved > 0 && (
        <p role="status" className="text-xs">
          Some acceptance history is missing or invalid. Load earlier records before changing the
          shared version.
        </p>
      )}
      {(error || records.error || messages.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || records.error || messages.error?.message}
        </p>
      )}
    </div>
  )
}
function VersionHistory({
  version,
  data,
  channel,
  label,
  issue,
  parents,
  priorRevisions,
  priorMessages
}: {
  version: DevelopmentEntry
  data: CommunityData
  channel: string
  label: string
  issue?: string
  parents: DevelopmentEntry[]
  priorRevisions: Set<string>
  priorMessages: Set<string>
}) {
  const [available, setAvailable] = useState<Map<string, boolean> | null>(null)
  const [error, setError] = useState('')
  const history = version.record.kind === 'version' ? version.record.history : undefined
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        if (!data.bridge?.get) throw new Error('History storage is unavailable.')
        const values = await Promise.all(
          (history?.inputs ?? []).map(async (input) => {
            const node = await data.bridge!.get!(input.id)
            return [
              input.id,
              !!node &&
                !node.deleted &&
                !node.properties.redacted &&
                node.properties.channel === channel &&
                node.createdBy === input.author
            ] as const
          })
        )
        if (alive) {
          setAvailable(new Map(values))
          setError('')
        }
      } catch (cause) {
        if (alive) {
          setAvailable(null)
          setError(String(cause))
        }
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [history, data.bridge, channel])
  return (
    <article className="space-y-2 border-t border-border pt-3 text-xs">
      <h4 className="font-medium">
        {label} · {data.nameFor(version.author)}
      </h4>
      {issue && <p role="alert">History incomplete: {issue}</p>}
      {!history ? (
        <p>Manual edit or imported source. No agent transcript was recorded for this update.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {history.provider} · {history.model} · fresh explicit context
          </p>
          {history.inputs
            .filter((input) => !priorRevisions.has(input.digest) && !priorMessages.has(input.id))
            .map((input) => (
              <div key={input.id} className="rounded-lg bg-muted/40 p-3">
                <p className="mb-1 text-[10px] text-muted-foreground">
                  {data.nameFor(input.author)} · revision at{' '}
                  {new Date(input.updatedAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap">
                  {available?.get(input.id)
                    ? input.content
                    : available
                      ? 'Message unavailable or removed — history incomplete.'
                      : 'Checking history access…'}
                </p>
              </div>
            ))}
          {history.inputs.some(
            (input) => priorRevisions.has(input.digest) || priorMessages.has(input.id)
          ) && (
            <p className="text-muted-foreground">
              Earlier message revisions reused from the iterations above.
            </p>
          )}
          <p className="whitespace-pre-wrap rounded-lg border border-border p-3">
            Published result: {version.content}
          </p>
          <details>
            <summary className="cursor-pointer">Input used for this update</summary>
            <p className="my-2">
              Template: {history.template}. Attachments excluded. {history.inputs.length} message
              revisions included.
            </p>
            <p className="whitespace-pre-wrap">{history.brief}</p>
            {history.inputs.map((input) => (
              <p key={input.digest} className="my-2 whitespace-pre-wrap">
                {available?.get(input.id) ? input.content : 'Message unavailable or removed.'}
              </p>
            ))}
          </details>
        </>
      )}
      {!history && (
        <p className="whitespace-pre-wrap rounded-lg border border-border p-3">{version.content}</p>
      )}
      {parents.map((parent) => {
        if (parent.record.kind !== 'version' || version.record.kind !== 'version') return null
        const diff = sourceChangeSummary(
          parent.record.extension.source,
          version.record.extension.source
        )
        return (
          <details key={parent.id}>
            <summary className="cursor-pointer">
              Source changes from {parent.record.extension.title} (+{diff.added} / −{diff.removed}{' '}
              lines)
            </summary>
            <p className="my-2">Changed section before</p>
            <pre className="max-h-60 overflow-auto rounded bg-muted p-2">
              {diff.before || '(no removed lines)'}
            </pre>
            <p className="my-2">Changed section after</p>
            <pre className="max-h-60 overflow-auto rounded bg-muted p-2">
              {diff.after || '(no added lines)'}
            </pre>
          </details>
        )
      })}
      {error && <p role="alert">{error}</p>}
    </article>
  )
}
