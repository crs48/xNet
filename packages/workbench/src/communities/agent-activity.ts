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
      (latestIds.has(run.id) &&
        (run.status === 'failed' ||
          run.status === 'interrupted' ||
          (run.status === 'completed' && run.purpose === 'reply' && !run.published)))
  )
  return { history, latestIds, current }
}
