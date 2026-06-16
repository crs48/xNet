import { describe, expect, it } from 'vitest'
import { FakeCommandRunner, cmd } from './command-runner'
import { defaultXnetGate, runValidationGate, type ValidationStep } from './validation-gate'

const steps: ValidationStep[] = [
  { name: 'typecheck', command: 'pnpm', args: ['typecheck'] },
  { name: 'lint', command: 'pnpm', args: ['lint'] },
  { name: 'test', command: 'pnpm', args: ['test'] }
]

describe('runValidationGate', () => {
  it('passes when every step succeeds', async () => {
    const runner = new FakeCommandRunner() // all default success
    const result = await runValidationGate(runner, '/repo', steps)
    expect(result.ok).toBe(true)
    expect(result.steps.map((s) => s.name)).toEqual(['typecheck', 'lint', 'test'])
    expect(runner.calls).toHaveLength(3)
  })

  it('short-circuits on the first failing step', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('pnpm', ['lint']), result: { code: 1, stderr: 'lint error' } }
    ])
    const result = await runValidationGate(runner, '/repo', steps)
    expect(result.ok).toBe(false)
    expect(result.failedStep).toBe('lint')
    // typecheck + lint ran; test did NOT (short-circuit).
    expect(result.steps.map((s) => s.name)).toEqual(['typecheck', 'lint'])
    expect(runner.calls).toHaveLength(2)
  })
})

describe('defaultXnetGate', () => {
  it('encodes typecheck → lint → test → fallow with a changedSince', () => {
    const gate = defaultXnetGate({ changedSince: 'origin/main' })
    expect(gate.map((s) => s.name)).toEqual(['typecheck', 'lint', 'test', 'fallow'])
    const fallow = gate.find((s) => s.name === 'fallow')!
    expect(fallow.args).toContain('--changed-since')
    expect(fallow.args).toContain('origin/main')
  })
})
