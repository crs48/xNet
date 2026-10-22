import type { CommunityAgents } from './use-community-agents'
import { Bot, RotateCcw, Square } from 'lucide-react'
import { secondaryButton } from './primitives'
export function AgentRunCards({
  agents,
  channelId,
  onPreview
}: {
  agents: CommunityAgents
  channelId: string
  onPreview?: (id: string) => void
}) {
  const runs = agents.snapshot.runs
    .filter((run) => run.channelId === channelId && (!run.published || run.purpose === 'extension'))
    .slice(-10)
  const act = (operation: Promise<unknown>) => {
    void operation.catch((cause: unknown) => agents.setError(String(cause)))
  }
  return (
    <div className="space-y-3 px-6 pt-5">
      {runs.map((run) => (
        <article
          key={run.id}
          aria-label={`${run.provider === 'codex' ? 'Codex' : 'Claude'} ${run.status}`}
          className="rounded-xl border border-border p-4"
        >
          <div className="flex items-center gap-2 text-xs">
            <Bot size={16} />
            <strong>{run.provider === 'codex' ? 'Codex' : 'Claude'}</strong>
            <span className="text-muted-foreground">
              {run.status === 'running' ? (run.text ? 'Replying…' : 'Thinking…') : run.status}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">On your device</span>
          </div>
          {run.purpose !== 'extension' && run.text && (
            <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-6">
              {run.text}
            </p>
          )}
          {run.error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {run.error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {run.status === 'running' && (
              <button className={secondaryButton} onClick={() => act(agents.port!.cancel(run.id))}>
                <Square size={12} />
                Stop
              </button>
            )}
            {['failed', 'cancelled', 'interrupted'].includes(run.status) && (
              <button className={secondaryButton} onClick={() => act(agents.port!.retry(run.id))}>
                <RotateCcw size={12} />
                Retry
              </button>
            )}
            {run.status === 'completed' && run.purpose === 'extension' && (
              <button className={secondaryButton} onClick={() => onPreview?.(run.id)}>
                Review extension
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">
              {run.runtimeVersion} · {run.model ?? 'Provider default'} · {run.contextCount} context
              messages
            </span>
          </div>
        </article>
      ))}
    </div>
  )
}
