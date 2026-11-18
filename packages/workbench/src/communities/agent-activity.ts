import type { CommunityAgentRun } from './agent-contract'

export function conversationAgentActivity(runs: CommunityAgentRun[], channelId: string) {
  const history = runs
    .filter((run) => run.channelId === channelId)
    .sort((a, b) => a.startedAt - b.startedAt)
  const latest = new Map(
    history.map((run) => [JSON.stringify([run.messageId, run.provider, run.purpose]), run])
  )
  const latestIds = new Set([...latest.values()].map((run) => run.id))
  const current = history.filter(
    (run) =>
      run.status === 'running' ||
      run.status === 'queued' ||
      (latestIds.has(run.id) &&
        ((run.status === 'cancelled' && run.id === history.at(-1)?.id) ||
          run.status === 'failed' ||
          run.status === 'interrupted' ||
          (run.status === 'completed' && run.purpose === 'reply' && !run.published)))
  )
  return { history, latestIds, current }
}

export const agentPhaseLabels = {
  connecting: 'Connecting to your agent',
  waiting: 'Working on your request',
  replying: 'Writing a reply',
  drafting: 'Building your extension',
  checking: 'Checking the response'
} as const

export const agentRunKind = (run: CommunityAgentRun) =>
  run.purpose === 'extension' ||
  run.extension ||
  run.activity?.some(({ phase }) => phase === 'drafting')
    ? 'Extension'
    : 'Reply'

export function agentRunLabel(run: CommunityAgentRun): string {
  if (run.status === 'queued') return 'Queued for the next update'
  if (run.status === 'cancelled') return 'Stopped'
  if (run.status === 'interrupted') return 'Interrupted'
  if (run.status === 'failed') return 'Couldn’t finish'
  if (run.status === 'completed')
    return run.published || run.purpose === 'extension' ? 'Finished' : 'Saving the reply'
  if (run.previewCheck?.status === 'running') return run.previewCheck.summary
  const phase = run.activity?.at(-1)?.phase
  return phase
    ? agentPhaseLabels[phase]
    : run.purpose === 'extension'
      ? agentPhaseLabels.drafting
      : run.text
        ? agentPhaseLabels.replying
        : agentPhaseLabels.waiting
}

export function agentDuration(start: number, end: number): string {
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** Keep attribution in synced data, but avoid repeating the visible agent byline locally. */
export function agentReplyContent(content: string, run: CommunityAgentRun): string {
  const provider = run.provider === 'codex' ? 'Codex' : 'Claude'
  const prefix = `${provider} · AI response requested and saved by `
  const end = content.indexOf('\n\n')
  return content.startsWith(prefix) && end > prefix.length ? content.slice(end + 2) : content
}
