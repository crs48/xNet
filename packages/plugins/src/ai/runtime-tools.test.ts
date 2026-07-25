/**
 * In-app tool-use loop (exploration 0394).
 *
 * The 28 `xnet_*` tools reached MCP clients and the bridge but never the
 * in-app assistant — `AiAgentRuntime` recorded a model's tool calls and then
 * dropped them, so the panel could only ever answer from injected context.
 * These pin the loop that closes that gap, and the guards on it.
 */

import type { AIGenerateRequest, AIProvider, AIStreamChunk, AIToolCall } from './providers'
import { describe, expect, it } from 'vitest'
import { createAiAgentRuntime } from './runtime'

/** A provider that returns scripted turns, recording every request it saw. */
function scriptedProvider(turns: Array<{ text: string; toolCalls?: AIToolCall[] }>): {
  provider: AIProvider
  requests: AIGenerateRequest[]
} {
  const requests: AIGenerateRequest[] = []
  let index = 0
  const provider: AIProvider = {
    name: 'scripted',
    async generate() {
      return ''
    },
    async generateWithTools(request) {
      requests.push(request)
      const turn = turns[Math.min(index, turns.length - 1)]
      index++
      return {
        text: turn.text,
        provider: 'scripted',
        model: 'scripted-1',
        ...(turn.toolCalls ? { toolCalls: turn.toolCalls } : {})
      }
    }
  }
  return { provider, requests }
}

/** Streaming variant — tool calls arrive as chunks rather than a response. */
function streamingProvider(turns: Array<{ text: string; toolCalls?: AIToolCall[] }>): AIProvider {
  let index = 0
  return {
    name: 'streaming',
    async generate() {
      return ''
    },
    async *stream(): AsyncIterable<AIStreamChunk> {
      const turn = turns[Math.min(index, turns.length - 1)]
      index++
      if (turn.text) {
        yield { type: 'text', text: turn.text, provider: 'streaming', model: 's-1' }
      }
      for (const toolCall of turn.toolCalls ?? []) {
        yield { type: 'tool_call', toolCall, provider: 'streaming', model: 's-1' }
      }
    }
  }
}

const searchCall: AIToolCall = {
  id: 'call-1',
  name: 'xnet_search',
  arguments: { query: 'roadmap' }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for runtime state')
}

async function runOnce(
  runtime: ReturnType<typeof createAiAgentRuntime>,
  content = 'what is on the roadmap?'
): Promise<string> {
  await runtime.load()
  const thread = await runtime.createThread({ title: 'test' })
  const result = await runtime.runTurn({ threadId: thread.id, content })
  await waitFor(() => runtime.getSnapshot().telemetry.runsCompleted === 1)
  const turn = runtime.getSnapshot().turns.find((t) => t.id === result.assistantTurn.id)
  return turn?.content ?? ''
}

describe('AiAgentRuntime tool loop (0394)', () => {
  it('executes a tool call and feeds the result back to the model', async () => {
    const { provider, requests } = scriptedProvider([
      { text: '', toolCalls: [searchCall] },
      { text: 'The roadmap has three items.' }
    ])
    const calls: AIToolCall[] = []
    const runtime = createAiAgentRuntime({
      provider,
      tools: [{ name: 'xnet_search', description: 'search the workspace' }],
      executeTool: async (call) => {
        calls.push(call)
        return { results: [{ id: 'page-1', title: 'Roadmap' }] }
      }
    })

    const text = await runOnce(runtime)

    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('xnet_search')
    expect(text).toContain('three items')

    // The second request must carry the tool result, or the model is guessing.
    const toolMessages = requests[1].messages?.filter((m) => m.role === 'tool') ?? []
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0].content).toContain('Roadmap')
    expect(toolMessages[0].toolCallId).toBe('call-1')
  })

  it('advertises tools to the provider', async () => {
    const { provider, requests } = scriptedProvider([{ text: 'hi' }])
    const runtime = createAiAgentRuntime({
      provider,
      tools: [{ name: 'xnet_search' }],
      executeTool: async () => ({})
    })
    await runOnce(runtime)
    expect(requests[0].tools?.map((t) => t.name)).toEqual(['xnet_search'])
  })

  it('runs exactly once when no executor is configured', async () => {
    // Advertising without an executor must stay inert — the previous behavior.
    const { provider, requests } = scriptedProvider([
      { text: 'thinking', toolCalls: [searchCall] },
      { text: 'should never be reached' }
    ])
    const runtime = createAiAgentRuntime({ provider, tools: [{ name: 'xnet_search' }] })

    const text = await runOnce(runtime)

    expect(requests).toHaveLength(1)
    expect(text).toBe('thinking')
  })

  it('refuses a tool outside the allow-list without executing it', async () => {
    const { provider } = scriptedProvider([
      {
        text: '',
        toolCalls: [{ id: 'c1', name: 'xnet_apply_page_markdown', arguments: {} }]
      },
      { text: 'I cannot edit pages here.' }
    ])
    let executed = 0
    const runtime = createAiAgentRuntime({
      provider,
      allowedTools: ['xnet_search'],
      executeTool: async () => {
        executed++
        return {}
      }
    })

    await runOnce(runtime)

    expect(executed).toBe(0)
    const denial = runtime
      .getSnapshot()
      .events.find((event) => event.type === 'tool.result' && event.payload.denied === true)
    expect(denial).toBeDefined()
    expect(String(denial?.payload.content)).toContain('not available')
  })

  it('hands a failing tool back to the model as an error instead of aborting', async () => {
    const { provider, requests } = scriptedProvider([
      { text: '', toolCalls: [searchCall] },
      { text: 'Search is unavailable right now.' }
    ])
    const runtime = createAiAgentRuntime({
      provider,
      executeTool: async () => {
        throw new Error('index offline')
      }
    })

    const text = await runOnce(runtime)

    expect(text).toContain('unavailable')
    const toolMessage = requests[1].messages?.find((m) => m.role === 'tool')
    expect(toolMessage?.content).toContain('index offline')
  })

  it('stops after maxToolSteps when a model keeps calling tools', async () => {
    // Every turn asks for another tool — without a bound this never returns.
    const { provider, requests } = scriptedProvider([{ text: '', toolCalls: [searchCall] }])
    let executed = 0
    const runtime = createAiAgentRuntime({
      provider,
      maxToolSteps: 2,
      executeTool: async () => {
        executed++
        return {}
      }
    })

    const text = await runOnce(runtime)

    expect(executed).toBe(2)
    expect(requests.length).toBe(3)
    expect(text).toContain('Stopped after 2 tool steps')
  })

  it('collects tool calls from a streaming provider too', async () => {
    const provider = streamingProvider([
      { text: 'looking...', toolCalls: [searchCall] },
      { text: ' found it.' }
    ])
    const calls: AIToolCall[] = []
    const runtime = createAiAgentRuntime({
      provider,
      executeTool: async (call) => {
        calls.push(call)
        return 'ok'
      }
    })

    const text = await runOnce(runtime)

    expect(calls).toHaveLength(1)
    expect(text).toContain('found it')
  })

  it('emits a tool.result event carrying what the tool returned', async () => {
    const { provider } = scriptedProvider([{ text: '', toolCalls: [searchCall] }, { text: 'done' }])
    const runtime = createAiAgentRuntime({ provider, executeTool: async () => 'plain string' })

    await runOnce(runtime)

    const event = runtime.getSnapshot().events.find((e) => e.type === 'tool.result')
    expect(event?.payload.content).toBe('plain string')
    expect(event?.payload.denied).toBe(false)
  })
})
