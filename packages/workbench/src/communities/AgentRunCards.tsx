import type { CommunityAgentRun } from './agent-contract'
import type { CommunityAgents } from './use-community-agents'
import { Bot, Check, ChevronRight, CircleAlert, RotateCcw, Square } from 'lucide-react'
import { useEffect, useState, type SyntheticEvent } from 'react'
import {
  agentDuration,
  agentPhaseLabels,
  agentRunKind,
  agentRunLabel,
  conversationAgentActivity
} from './agent-activity'

const actionClass =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40'
const providerName = (run: CommunityAgentRun) => (run.provider === 'codex' ? 'Codex' : 'Claude')
const revealActivity = (event: SyntheticEvent<HTMLDetailsElement>) => {
  const details = event.currentTarget
  const viewport = details.closest('[data-chat-scroll]')
  if (!details.open || !viewport) return
  // scrollIntoView also moves outer overflow-hidden shell ancestors in Electron.
  const bounds = details.getBoundingClientRect()
  const visible = viewport.getBoundingClientRect()
  if (bounds.height > visible.height || bounds.top < visible.top)
    viewport.scrollTop += bounds.top - visible.top
  else if (bounds.bottom > visible.bottom) viewport.scrollTop += bounds.bottom - visible.bottom
}

function RunActions({
  run,
  agents,
  latest = true,
  onPreview
}: {
  run: CommunityAgentRun
  agents: CommunityAgents
  latest?: boolean
  onPreview?: (id: string) => void
}) {
  const [pending, setPending] = useState(false)
  const act = async (operation: () => Promise<unknown> | undefined) => {
    setPending(true)
    try {
      await operation()
    } catch (cause) {
      agents.setError(String(cause))
    } finally {
      setPending(false)
    }
  }
  const busy = agents.snapshot.runs.some((entry) => entry.status === 'running')
  return (
    <>
      {(run.status === 'running' || run.status === 'queued') && (
        <button
          className={actionClass}
          disabled={pending || !agents.port}
          onClick={() => void act(() => agents.port?.cancel(run.id))}
        >
          <Square size={11} fill="currentColor" aria-hidden="true" /> Stop
        </button>
      )}
      {latest && ['failed', 'cancelled', 'interrupted'].includes(run.status) && (
        <button
          className={actionClass}
          disabled={pending || busy || !agents.port}
          onClick={() => void act(() => agents.port?.retry(run.id))}
        >
          <RotateCcw size={12} aria-hidden="true" /> Try again
        </button>
      )}
      {run.status === 'completed' && run.purpose === 'reply' && !run.published && (
        <button className={actionClass} onClick={agents.retryPublication}>
          Retry saving
        </button>
      )}
      {onPreview &&
        run.status === 'completed' &&
        (run.purpose === 'extension' || run.extension) && (
          <button className={actionClass} onClick={() => onPreview(run.id)}>
            Review extension
          </button>
        )}
    </>
  )
}

function ActivityGlyph({ run }: { run: CommunityAgentRun }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted"
    >
      {run.status === 'running' ? (
        <span className="agent-working-dots flex gap-0.5">
          <i />
          <i />
          <i />
        </span>
      ) : run.status === 'completed' ? (
        <Check size={15} />
      ) : run.status === 'cancelled' ? (
        <Square size={12} />
      ) : (
        <CircleAlert size={15} />
      )}
    </span>
  )
}

function RunTimeline({ run }: { run: CommunityAgentRun }) {
  const entries = run.activity ?? []
  const running = run.status === 'running'
  return (
    <div className="agent-detail-enter mt-2 space-y-3 pb-2 text-xs text-muted-foreground">
      {entries.length > 0 ? (
        <ol aria-label="Observed steps" className="space-y-2 border-l border-border pl-3">
          {entries.map((entry, index) => {
            const active = running && index === entries.length - 1
            const failed = !running && run.status !== 'completed' && index === entries.length - 1
            return (
              <li key={entry.phase} className="flex items-center gap-2">
                {active ? (
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full bg-foreground motion-safe:animate-pulse"
                  />
                ) : failed ? (
                  <Square size={11} aria-hidden="true" />
                ) : (
                  <Check size={11} aria-hidden="true" />
                )}
                <span className={active ? 'text-foreground' : undefined}>
                  {agentPhaseLabels[entry.phase]}
                  {active ? ' · now' : failed ? ' · stopped here' : ''}
                </span>
                <span className="ml-auto tabular-nums">
                  {agentDuration(run.startedAt, entry.at)}
                </span>
              </li>
            )
          })}
          {!running && (
            <li className="flex items-center gap-2 text-foreground">
              {run.status === 'completed' ? (
                <Check size={11} aria-hidden="true" />
              ) : (
                <Square size={11} aria-hidden="true" />
              )}
              {run.status === 'completed'
                ? run.published
                  ? 'Reply saved to this conversation'
                  : 'Response ready'
                : agentRunLabel(run)}
            </li>
          )}
        </ol>
      ) : (
        <p>Step details weren’t recorded for this request.</p>
      )}
      <p>
        {run.contextCount} {run.contextCount === 1 ? 'message' : 'messages'} supplied for this
        request. Runs through your {providerName(run)} login.
      </p>
      <details>
        <summary className="w-fit cursor-pointer py-1 hover:text-foreground">
          Technical details
        </summary>
        <p className="mt-1 break-words leading-5">
          {run.runtimeVersion} · {run.model ?? 'Provider default'}
        </p>
        {run.error && <p className="mt-2 whitespace-pre-wrap break-words leading-5">{run.error}</p>}
      </details>
    </div>
  )
}

/** A quiet receipt stays with the answer; the full run history remains available separately. */
export function AgentRunReceipt({ run }: { run: CommunityAgentRun }) {
  return (
    <details
      data-agent-activity
      onToggle={revealActivity}
      className="group/activity mt-2 text-xs text-muted-foreground"
    >
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-1 hover:text-foreground">
        <span aria-hidden="true">
          {run.status === 'completed' ? <Check size={12} /> : <Square size={10} />}
        </span>
        {run.finishedAt && run.status === 'completed'
          ? `Worked for ${agentDuration(run.startedAt, run.finishedAt)}`
          : `${agentRunLabel(run)} · activity`}
        <ChevronRight
          size={12}
          aria-hidden="true"
          className="transition-transform group-open/activity:rotate-90"
        />
      </summary>
      <RunTimeline run={run} />
    </details>
  )
}

function LiveRun({ run, agents }: { run: CommunityAgentRun; agents: CommunityAgents }) {
  const [now, setNow] = useState(Date.now)
  const running = run.status === 'running'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  const phase = run.activity?.at(-1)
  const slow = running && now - (phase?.at ?? run.startedAt) >= 30_000
  const label = agentRunLabel(run)
  return (
    <article
      aria-label={`${providerName(run)} ${run.status}`}
      className="agent-detail-enter flex gap-3 text-sm"
    >
      <ActivityGlyph run={run} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <details
            data-agent-activity
            onToggle={revealActivity}
            className="group/activity min-w-0 flex-1"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded py-1.5">
              <span className="font-medium">{providerName(run)}</span>
              <span className="text-muted-foreground">{label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {agentDuration(run.startedAt, run.finishedAt ?? now)}
              </span>
              <ChevronRight
                size={13}
                aria-hidden="true"
                className="text-muted-foreground transition-transform group-open/activity:rotate-90"
              />
            </summary>
            <RunTimeline run={run} />
          </details>
          <RunActions run={run} agents={agents} />
        </div>
        {slow && (
          <p className="mt-1 text-xs text-muted-foreground">
            Still working. You can stop this request at any time.
          </p>
        )}
        {run.status !== 'running' && run.status !== 'completed' && (
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {run.status === 'cancelled' && run.error === 'Stopped by you.'
              ? 'Stopped by you. Nothing was sent to the conversation.'
              : run.error
                ? run.error.slice(0, 240) + (run.error.length > 240 ? '…' : '')
                : 'No reply was sent. Try again when you’re ready.'}
          </p>
        )}
        {run.purpose === 'reply' && run.text && (running || run.status === 'completed') && (
          <div className="mt-2">
            {running && <p className="mb-1 text-[11px] text-muted-foreground">Draft reply</p>}
            <p className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[14px] leading-[1.65]">
              {run.text}
            </p>
          </div>
        )}
        {run.purpose === 'reply' && run.text && !running && run.status !== 'completed' && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer py-1">View unfinished reply</summary>
            <p className="mt-1 whitespace-pre-wrap break-words leading-6">{run.text}</p>
          </details>
        )}
      </div>
    </article>
  )
}

export function AgentRunCards({
  agents,
  channelId
}: {
  agents: CommunityAgents
  channelId: string
}) {
  const { current, history } = conversationAgentActivity(agents.snapshot.runs, channelId)
  const latest = history.at(-1)
  return (
    <>
      <p role="status" aria-atomic="true" className="sr-only">
        {latest ? `${providerName(latest)}: ${agentRunLabel(latest)}.` : ''}
      </p>
      {current.length > 0 && (
        <div className="space-y-4 px-6 pt-5">
          {current.map((run) => (
            <LiveRun key={run.id} run={run} agents={agents} />
          ))}
        </div>
      )}
    </>
  )
}

export function AgentRunHistory({
  agents,
  channelId,
  onPreview
}: {
  agents: CommunityAgents
  channelId: string
  onPreview: (id: string) => void
}) {
  const { history, latestIds } = conversationAgentActivity(agents.snapshot.runs, channelId)
  return (
    <section aria-label="Agent activity" className="px-6 py-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Past requests on this device. Extension versions are in Conversation extensions.
      </p>
      {!history.length && <p className="text-sm text-muted-foreground">No agent activity yet.</p>}
      <ol className="divide-y divide-border">
        {[...history].reverse().map((run) => (
          <li key={run.id} className="space-y-1 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Bot size={14} aria-hidden="true" />
              <span className="font-medium">{providerName(run)}</span>
              <span>{agentRunKind(run)}</span>
              <span className="text-muted-foreground">
                {agentRunLabel(run)}
                {!latestIds.has(run.id) ? ' · retried' : ''}
              </span>
              <time
                className="ml-auto text-muted-foreground"
                dateTime={new Date(run.startedAt).toISOString()}
              >
                {new Date(run.startedAt).toLocaleString()}
              </time>
              <RunActions
                run={run}
                agents={agents}
                latest={latestIds.has(run.id)}
                onPreview={onPreview}
              />
            </div>
            <AgentRunReceipt run={run} />
            {run.purpose === 'reply' && run.text && !run.published && (
              <details className="text-xs">
                <summary className="w-fit cursor-pointer py-1 text-muted-foreground">
                  View unsent reply
                </summary>
                <p className="whitespace-pre-wrap break-words leading-6">{run.text}</p>
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
