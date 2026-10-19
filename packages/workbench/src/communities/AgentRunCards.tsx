import type { CommunityAgentRun } from './agent-contract'
import type { CommunityAgents } from './use-community-agents'
import { Bot, RotateCcw, Square } from 'lucide-react'
import { conversationAgentActivity } from './agent-activity'

const actionClass =
  'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40'
const providerName = (run: CommunityAgentRun) => (run.provider === 'codex' ? 'Codex' : 'Claude')

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
  const act = (operation: Promise<unknown> | undefined) => {
    void operation?.catch((cause: unknown) => agents.setError(String(cause)))
  }
  const busy = agents.snapshot.runs.some((entry) => entry.status === 'running')
  return (
    <>
      {run.status === 'running' && (
        <button className={actionClass} onClick={() => act(agents.port?.cancel(run.id))}>
          <Square size={12} /> Stop
        </button>
      )}
      {latest && ['failed', 'cancelled', 'interrupted'].includes(run.status) && (
        <button
          className={actionClass}
          disabled={busy || !agents.port}
          onClick={() => act(agents.port?.retry(run.id))}
        >
          <RotateCcw size={12} /> Retry
        </button>
      )}
      {onPreview && run.status === 'completed' && run.purpose === 'extension' && (
        <button className={actionClass} onClick={() => onPreview(run.id)}>
          Review extension
        </button>
      )}
    </>
  )
}

function RunDetails({ run }: { run: CommunityAgentRun }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded py-1 hover:text-foreground">Details</summary>
      <p className="mt-1 break-words leading-5">
        {run.runtimeVersion} · {run.model ?? 'Provider default'} · {run.contextCount} context
        messages
      </p>
      {run.error && <p className="mt-2 break-words leading-5">{run.error}</p>}
    </details>
  )
}

export function AgentRunCards({
  agents,
  channelId
}: {
  agents: CommunityAgents
  channelId: string
}) {
  const { current } = conversationAgentActivity(agents.snapshot.runs, channelId)
  if (!current.length) return null
  return (
    <div className="space-y-3 px-6 pt-5">
      {current.map((run) => (
        <article key={run.id} aria-label={`${providerName(run)} ${run.status}`} className="text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Bot size={15} />
            <span role="status">
              {providerName(run)}{' '}
              {run.status === 'running'
                ? run.purpose === 'extension'
                  ? 'is building an extension…'
                  : run.text
                    ? 'is replying…'
                    : 'is thinking…'
                : run.status === 'completed'
                  ? 'reply is waiting to be saved.'
                  : 'couldn’t finish this request.'}
            </span>
            <RunActions run={run} agents={agents} />
          </div>
          {run.purpose === 'reply' && run.text && (
            <p className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words leading-6">
              {run.text}
            </p>
          )}
          {run.status !== 'running' && <RunDetails run={run} />}
        </article>
      ))}
    </div>
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
              <span className="font-medium">{providerName(run)}</span>
              <span>{run.purpose === 'extension' ? 'Extension' : 'Reply'}</span>
              <span className="text-muted-foreground">
                {run.status}
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
            <RunDetails run={run} />
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
