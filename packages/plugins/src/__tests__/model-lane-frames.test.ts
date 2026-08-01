import { describe, expect, it, vi } from 'vitest'
import { toolCallFrame, toolResultFrame, type AiAgentFrame } from '../ai/agent-frames'
import { AiAgentRuntime } from '../ai/runtime'
import type { AIProvider, AIStreamChunk } from '../ai/providers'

/** A provider that streams a scripted sequence of chunks, then stops. */
function scriptedProvider(chunks: AIStreamChunk[][]): AIProvider {
  let turn = 0
  return {
    name: 'scripted',
    async generate() {
      return ''
    },
    async *stream(): AsyncIterable<AIStreamChunk> {
      for (const chunk of chunks[turn] ?? []) yield chunk
      turn += 1
    }
  }
}

const text = (t: string): AIStreamChunk => ({
  type: 'text',
  text: t,
  provider: 'scripted',
  model: 'test'
})

const call = (id: string, name: string, args: unknown = {}): AIStreamChunk => ({
  type: 'tool_call',
  toolCall: { id, name, arguments: args as Record<string, unknown> },
  provider: 'scripted',
  model: 'test'
})

async function runTurn(config: {
  chunks: AIStreamChunk[][]
  tools?: string[]
  executeTool?: (c: { name: string }) => Promise<unknown>
}): Promise<AiAgentFrame[]> {
  const frames: AiAgentFrame[] = []
  const runtime = new AiAgentRuntime({
    provider: scriptedProvider(config.chunks),
    onFrame: (frame) => frames.push(frame),
    ...(config.executeTool ? { executeTool: config.executeTool as never } : {}),
    ...(config.tools ? { allowedTools: config.tools } : {})
  })
  const thread = await runtime.createThread({ title: 'test' })
  await runtime.runTurn({ threadId: thread.id, content: 'hi' })
  // The run is asynchronous — wait for it to settle before reading frames.
  await vi.waitFor(() => {
    const { runsCompleted, runsFailed } = runtime.getSnapshot().telemetry
    expect(runsCompleted + runsFailed).toBe(1)
  })
  return frames
}

describe('model-lane frames (exploration 0416)', () => {
  it('maps a tool call and its result to the shared vocabulary', () => {
    expect(toolCallFrame({ id: 'c1', name: 'xnet_query', arguments: { a: 1 } })).toEqual({
      type: 'tool_call',
      id: 'c1',
      name: 'xnet_query',
      input: { a: 1 }
    })
    expect(toolResultFrame({ id: 'c1' }, 'rows', false)).toEqual({
      type: 'tool_result',
      id: 'c1',
      ok: true,
      content: 'rows'
    })
  })

  it('reports a denied tool as a failed result, not an absent one', () => {
    expect(toolResultFrame({ id: 'c1' }, 'Denied: …', true)).toMatchObject({
      type: 'tool_result',
      ok: false
    })
  })

  it('emits delta frames while streaming text', async () => {
    const frames = await runTurn({ chunks: [[text('hel'), text('lo')]] })

    const deltas = frames.filter((f) => f.type === 'delta')
    expect(deltas).toEqual([
      { type: 'delta', text: 'hel' },
      { type: 'delta', text: 'lo' }
    ])
  })

  it('emits a terminal ok result when the turn completes', async () => {
    const frames = await runTurn({ chunks: [[text('done')]] })
    expect(frames.at(-1)).toEqual({ type: 'result', ok: true })
  })

  it('emits tool_call and tool_result around an executed tool', async () => {
    const executeTool = vi.fn().mockResolvedValue({ rows: 1 })
    const frames = await runTurn({
      chunks: [[call('c1', 'xnet_query')], [text('answer')]],
      executeTool
    })

    const kinds = frames.map((f) => f.type)
    expect(kinds).toContain('tool_call')
    expect(kinds).toContain('tool_result')
    expect(kinds.indexOf('tool_call')).toBeLessThan(kinds.indexOf('tool_result'))

    const result = frames.find((f) => f.type === 'tool_result')
    expect(result).toMatchObject({ id: 'c1', ok: true })
  })

  it('marks a disallowed tool as not ok', async () => {
    const frames = await runTurn({
      chunks: [[call('c1', 'xnet_delete')], [text('ok')]],
      tools: ['xnet_query'],
      executeTool: async () => ({})
    })

    const result = frames.find((f) => f.type === 'tool_result')
    expect(result).toMatchObject({ id: 'c1', ok: false })
  })

  it('costs nothing and changes nothing when no sink is supplied', async () => {
    const runtime = new AiAgentRuntime({ provider: scriptedProvider([[text('hi')]]) })
    const thread = await runtime.createThread({ title: 'test' })
    await expect(
      runtime.runTurn({ threadId: thread.id, content: 'hi' })
    ).resolves.toBeDefined()
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().telemetry.runsCompleted).toBe(1)
    )
  })
})
