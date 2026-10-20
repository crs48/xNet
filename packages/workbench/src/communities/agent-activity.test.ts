import type { CommunityAgentRun } from './agent-contract'
import { describe, expect, it } from 'vitest'
import {
  agentDuration,
  agentPhaseLabels,
  agentRunKind,
  agentReplyContent,
  agentRunLabel,
  conversationAgentActivity
} from './agent-activity'

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

describe('agent activity presentation', () => {
  it('identifies a stopped extension build before a complete proposal exists', () => {
    expect(
      agentRunKind(run({ status: 'cancelled', activity: [{ phase: 'drafting', at: 1 }] }))
    ).toBe('Extension')
    expect(agentRunKind(run({ status: 'completed', published: true }))).toBe('Reply')
  })
  it('keeps the latest cancellation visible until the next request, without accumulating alerts', () => {
    const stopped = run({ status: 'cancelled' })
    expect(conversationAgentActivity([stopped], 'film-club').current).toEqual([stopped])
    const next = run({ id: 'next', messageId: 'next', startedAt: 2, status: 'running' })
    expect(conversationAgentActivity([stopped, next], 'film-club').current).toEqual([next])
  })
  it('uses recorded phases without letting them override terminal states', () => {
    for (const [phase, label] of Object.entries(agentPhaseLabels)) {
      const activity = [{ phase: phase as keyof typeof agentPhaseLabels, at: 1 }]
      expect(agentRunLabel(run({ status: 'running', activity }))).toBe(label)
      expect(agentRunLabel(run({ status: 'failed', activity }))).toBe('Couldn’t finish')
      expect(agentRunLabel(run({ status: 'completed', published: true, activity }))).toBe(
        'Finished'
      )
    }
    expect(agentRunLabel(run({ status: 'completed' }))).toBe('Saving the reply')
    expect(agentRunLabel(run({ status: 'running' }))).toBe('Working on your request')
  })
  it('formats real elapsed time without a fake percentage or negative durations', () => {
    expect(agentDuration(1000, 500)).toBe('0s')
    expect(agentDuration(0, 59000)).toBe('59s')
    expect(agentDuration(0, 61000)).toBe('1m 1s')
  })
  it('removes only the matching redundant attribution line, retaining edited and truncated content', () => {
    const content =
      'Codex · AI response requested and saved by You\n\nSaved preview\n[Preview ends here.]'
    expect(agentReplyContent(content, run({}))).toBe('Saved preview\n[Preview ends here.]')
    expect(agentReplyContent(content, run({ provider: 'claude' }))).toBe(content)
    expect(agentReplyContent('An edited answer', run({}))).toBe('An edited answer')
    expect(agentReplyContent('Codex · AI response requested and saved by ', run({}))).toBe(
      'Codex · AI response requested and saved by '
    )
  })
})
