import type { CommunityAgentRun } from './agent-contract'
import { describe, expect, it } from 'vitest'
import { conversationAgentActivity } from './agent-activity'

const run = (overrides: Partial<CommunityAgentRun>): CommunityAgentRun => ({
  id: 'attempt-1',
  channelId: 'film-club',
  messageId: 'question-1',
  replyId: 'reply-1',
  provider: 'codex',
  runtimeVersion: 'codex-cli',
  owner: 'me',
  status: 'failed',
  text: '',
  startedAt: 1,
  contextCount: 0,
  published: false,
  purpose: 'reply',
  ...overrides
})

describe('conversation agent activity', () => {
  it('keeps resolved failures and completed extension builds in history only', () => {
    const runs = [
      run({ purpose: 'extension' }),
      run({ id: 'retry', startedAt: 2, purpose: 'extension', status: 'completed' }),
      run({
        id: 'revision',
        messageId: 'question-2',
        startedAt: 3,
        purpose: 'extension',
        status: 'completed'
      })
    ]
    const activity = conversationAgentActivity(runs, 'film-club')
    expect(activity.current).toEqual([])
    expect(activity.history).toEqual(runs)
    expect(activity.latestIds.has('attempt-1')).toBe(false)
  })

  it('replaces a failed attempt with its running retry without mutating stored history', () => {
    const failed = run({})
    const retry = run({ id: 'retry', startedAt: 2, status: 'running' })
    const runs = [retry, failed]
    expect(conversationAgentActivity(runs, 'film-club').current).toEqual([retry])
    expect(runs).toEqual([retry, failed])
  })

  it('does not hide an unrelated unresolved failure after another request succeeds', () => {
    const failed = run({})
    const completed = run({
      id: 'another',
      messageId: 'question-2',
      startedAt: 2,
      status: 'completed',
      published: true
    })
    expect(conversationAgentActivity([failed, completed], 'film-club').current).toEqual([failed])
  })

  it('keeps completed replies visible until publication is acknowledged', () => {
    const pending = run({ status: 'completed', text: 'An answer' })
    expect(conversationAgentActivity([pending], 'film-club').current).toEqual([pending])
    expect(
      conversationAgentActivity([{ ...pending, published: true }], 'film-club').current
    ).toEqual([])
  })

  it('keeps deliberate cancellations in history and interruptions actionable', () => {
    const cancelled = run({ status: 'cancelled' })
    const interrupted = run({ id: 'interrupted', messageId: 'question-2', status: 'interrupted' })
    const activity = conversationAgentActivity([cancelled, interrupted], 'film-club')
    expect(activity.current).toEqual([interrupted])
    expect(activity.history).toEqual([cancelled, interrupted])
  })

  it('isolates channels, providers, and purposes when matching retries', () => {
    const failed = run({})
    const others = [
      run({ id: 'other-channel', channelId: 'another', status: 'completed', published: true }),
      run({ id: 'other-provider', provider: 'claude', status: 'completed', published: true }),
      run({ id: 'other-purpose', purpose: 'extension', status: 'completed' })
    ]
    const activity = conversationAgentActivity([failed, ...others], 'film-club')
    expect(activity.current).toEqual([failed])
    expect(activity.history.map((entry) => entry.id)).not.toContain('other-channel')
  })
})
