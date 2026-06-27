/**
 * Charter §Agency receipt: the assistant scaffolds rather than substitutes by
 * default, and every assistant turn is legibly marked ai-generated. `draft`
 * (the model writes finished prose) is never the default — it must be opted in.
 */

import type { AIGenerateRequest, AIGenerateResponse, AIProvider } from '../ai/providers'
import { describe, expect, it } from 'vitest'
import {
  AI_GENERATED_PROVENANCE,
  SCAFFOLD_SYSTEM_GUARD,
  assistTurnProvenance,
  composeAssistSystemPrompt,
  createAiAgentRuntime,
  createMemoryAiAgentRuntimeStorage,
  type AiAssistMode
} from '../ai/runtime'

class EchoProvider implements AIProvider {
  readonly name = 'Echo'

  getCapabilities() {
    return {
      tools: false,
      structuredOutputs: false,
      streaming: false,
      contextWindow: 8192,
      local: true,
      privacy: 'local' as const,
      quality: 'local' as const
    }
  }

  async generate(_prompt: string): Promise<string> {
    return 'reply'
  }

  async generateWithTools(_request: AIGenerateRequest): Promise<AIGenerateResponse> {
    return { text: 'reply', provider: this.name, model: 'echo' }
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for runtime state')
}

function newRuntime(assistMode?: AiAssistMode) {
  return createAiAgentRuntime({
    provider: new EchoProvider(),
    storage: createMemoryAiAgentRuntimeStorage(),
    clock: () => new Date('2026-06-27T12:00:00.000Z'),
    ...(assistMode ? { assistMode } : {})
  })
}

describe('AI assist mode (Charter §Agency)', () => {
  it('defaults to scaffold — the human stays the author', () => {
    expect(newRuntime().getAssistMode()).toBe('scaffold')
  })

  it('never defaults to draft; draft requires an explicit opt-in', () => {
    expect(newRuntime().getAssistMode()).not.toBe('draft')
    expect(newRuntime('draft').getAssistMode()).toBe('draft')
  })

  it('marks every assistant turn ai-generated, with the mode it was produced under', async () => {
    const runtime = newRuntime()
    const thread = await runtime.createThread({ title: 'Essay' })
    await runtime.runTurn({ threadId: thread.id, content: 'Draft my intro' })
    await waitFor(() => runtime.getSnapshot().telemetry.runsCompleted === 1)

    const assistantTurn = runtime.getSnapshot().turns.find((turn) => turn.role === 'assistant')
    expect(assistantTurn?.metadata).toMatchObject({
      provenance: AI_GENERATED_PROVENANCE,
      assistMode: 'scaffold'
    })
  })

  it('tags draft turns ai-generated too, recording the opted-in mode', async () => {
    const runtime = newRuntime('draft')
    const thread = await runtime.createThread({ title: 'Essay' })
    await runtime.runTurn({ threadId: thread.id, content: 'Write the whole thing' })
    await waitFor(() => runtime.getSnapshot().telemetry.runsCompleted === 1)

    const assistantTurn = runtime.getSnapshot().turns.find((turn) => turn.role === 'assistant')
    expect(assistantTurn?.metadata).toMatchObject({
      provenance: AI_GENERATED_PROVENANCE,
      assistMode: 'draft'
    })
  })

  it('appends the cognitive-debt guard only in scaffold mode', () => {
    expect(composeAssistSystemPrompt('BASE', 'scaffold')).toBe(`BASE\n\n${SCAFFOLD_SYSTEM_GUARD}`)
    expect(composeAssistSystemPrompt(undefined, 'scaffold')).toBe(SCAFFOLD_SYSTEM_GUARD)
    // Draft passes the base through untouched — no guard, no surprise injection.
    expect(composeAssistSystemPrompt('BASE', 'draft')).toBe('BASE')
    expect(composeAssistSystemPrompt(undefined, 'draft')).toBeUndefined()
  })

  it('exposes provenance as a reusable helper for surfaces (badge data)', () => {
    expect(assistTurnProvenance('scaffold')).toEqual({
      provenance: 'ai-generated',
      assistMode: 'scaffold'
    })
  })
})
