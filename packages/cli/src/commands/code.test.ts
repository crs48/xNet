import type { AgentTaskResult } from '@xnetjs/devkit'
import { describe, expect, it } from 'vitest'
import { resolveCodeRunConfig, summarizeAgentTaskResult } from './code'

const RESULT = (over: Partial<AgentTaskResult> = {}): AgentTaskResult => ({
  ok: true,
  branch: 'agent/code-x',
  worktreePath: '/wt',
  gate: { ok: true, steps: [] },
  rolledBack: false,
  agentOutput: '',
  ...over
})

describe('resolveCodeRunConfig', () => {
  it('derives id/branch/worktree from the prompt with a fixed clock', () => {
    const config = resolveCodeRunConfig('Add a dark mode toggle!', {}, '/repo', () => 0)
    expect(config.id).toBe('code-add-a-dark-mode-toggle-0')
    expect(config.branch).toBe('agent/code-add-a-dark-mode-toggle-0')
    expect(config.worktreePath).toBe('/repo/.xnet/agent-worktrees/code-add-a-dark-mode-toggle-0')
    expect(config.base).toBe('origin/main')
    expect(config.keepWorktree).toBe(false)
    expect(config.gate.map((s) => s.name)).toEqual(['typecheck', 'lint', 'test', 'fallow'])
  })

  it('honours explicit id/branch/base/worktree', () => {
    const config = resolveCodeRunConfig(
      'x',
      { id: 't1', branch: 'feat/x', base: 'origin/dev', worktree: '/tmp/wt' },
      '/repo'
    )
    expect(config.id).toBe('t1')
    expect(config.branch).toBe('feat/x')
    expect(config.base).toBe('origin/dev')
    expect(config.worktreePath).toBe('/tmp/wt')
    expect(config.gate.some((s) => s.args.includes('origin/dev'))).toBe(true)
  })

  it('keeps the worktree when a PR is requested', () => {
    expect(resolveCodeRunConfig('x', { pr: true }, '/repo').keepWorktree).toBe(true)
    expect(resolveCodeRunConfig('x', { keep: true }, '/repo').keepWorktree).toBe(true)
  })
})

describe('summarizeAgentTaskResult', () => {
  it('reports a checkpointed pass', () => {
    expect(summarizeAgentTaskResult(RESULT())).toMatch(/passed the gate/)
  })
  it('reports no-changes', () => {
    expect(summarizeAgentTaskResult(RESULT({ noChanges: true }))).toMatch(/no changes/)
  })
  it('reports a rolled-back gate failure with the failing step', () => {
    const summary = summarizeAgentTaskResult(
      RESULT({
        ok: false,
        rolledBack: true,
        gate: { ok: false, steps: [], failedStep: 'lint' }
      })
    )
    expect(summary).toMatch(/gate failed at "lint"/)
    expect(summary).toMatch(/rolled back/)
  })
  it('reports a plain agent failure', () => {
    expect(summarizeAgentTaskResult(RESULT({ ok: false }))).toMatch(/agent run failed/)
  })
})
