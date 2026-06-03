/**
 * Tests for the in-app AI agent runtime.
 */

import type { AIGenerateRequest, AIProvider, AIStreamChunk } from '../ai/providers'
import { describe, expect, it } from 'vitest'
import {
  createAiAgentRuntime,
  createMemoryAiAgentRuntimeStorage,
  type AiAgentRuntimeSnapshot
} from '../ai/runtime'
import { createAiOperation, type AiMutationPlan } from '../ai-surface'

class StreamingProvider implements AIProvider {
  readonly name = 'StreamingMock'

  constructor(private readonly chunks: AIStreamChunk[]) {}

  getCapabilities() {
    return {
      tools: true,
      structuredOutputs: true,
      streaming: true,
      contextWindow: 128_000,
      local: true,
      privacy: 'local' as const,
      quality: 'balanced' as const
    }
  }

  async generate(_prompt: string): Promise<string> {
    return 'fallback'
  }

  async *stream(_request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    for (const chunk of this.chunks) {
      yield chunk
    }
  }
}

class SlowStreamingProvider extends StreamingProvider {
  async *stream(_request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    yield {
      type: 'text',
      text: 'start',
      provider: this.name,
      model: 'mock-stream'
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
    yield {
      type: 'text',
      text: 'late',
      provider: this.name,
      model: 'mock-stream'
    }
  }
}

function createPlan(): AiMutationPlan {
  return {
    id: 'plan_1',
    actor: 'agent',
    intent: 'Rewrite page',
    risk: 'medium',
    requiredScopes: ['page.read', 'page.write'],
    changes: [
      {
        targetKind: 'page',
        targetId: 'page_1',
        baseRevision: 'updatedAt:1',
        operations: [createAiOperation('replaceMarkdown', { markdown: '# Updated' })]
      }
    ],
    validation: { valid: true, errors: [], warnings: [] },
    createdAt: '2026-06-02T12:00:00.000Z',
    status: 'proposed'
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for runtime state')
}

describe('AiAgentRuntime', () => {
  it('persists thread turns and streams model, tool, and usage events', async () => {
    const storage = createMemoryAiAgentRuntimeStorage()
    const runtime = createAiAgentRuntime({
      provider: new StreamingProvider([
        { type: 'text', text: 'Hello ', provider: 'StreamingMock', model: 'mock-stream' },
        { type: 'text', text: 'world', provider: 'StreamingMock', model: 'mock-stream' },
        {
          type: 'tool_call',
          provider: 'StreamingMock',
          model: 'mock-stream',
          toolCall: { id: 'tool_1', name: 'xnet_search', arguments: { query: 'roadmap' } }
        },
        {
          type: 'usage',
          provider: 'StreamingMock',
          model: 'mock-stream',
          usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }
        },
        { type: 'done', provider: 'StreamingMock', model: 'mock-stream' }
      ]),
      storage,
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })
    const events: string[] = []
    runtime.subscribe((event) => events.push(event.type))

    const thread = await runtime.createThread({ title: 'Current page' })
    await runtime.runTurn({
      threadId: thread.id,
      content: 'Summarize the roadmap',
      request: {
        tools: [{ name: 'xnet_search', description: 'Search workspace' }],
        risk: 'low',
        complexity: 'low'
      }
    })

    await waitFor(() => runtime.getSnapshot().telemetry.runsCompleted === 1)
    const snapshot = runtime.getSnapshot()
    const persisted = storage.snapshot()
    const assistantTurn = snapshot.turns.find((turn) => turn.role === 'assistant')

    expect(assistantTurn).toMatchObject({
      status: 'completed',
      content: 'Hello world',
      provider: 'StreamingMock',
      model: 'mock-stream',
      usage: { totalTokens: 14 }
    })
    expect(assistantTurn?.toolCalls?.[0]).toMatchObject({ name: 'xnet_search' })
    expect(events).toEqual(
      expect.arrayContaining(['model.delta', 'tool.call', 'usage', 'run.completed'])
    )
    expect(persisted.threads[0].id).toBe(thread.id)
  })

  it('tracks approval controls and accepted or rejected telemetry', async () => {
    const runtime = createAiAgentRuntime({
      provider: new StreamingProvider([]),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })
    const thread = await runtime.createThread({ title: 'Approval test' })

    const approval = await runtime.requestApproval({
      threadId: thread.id,
      plan: createPlan()
    })
    const approved = await runtime.resolveApproval({
      approvalId: approval.id,
      status: 'approved',
      note: 'Looks good'
    })
    const second = await runtime.requestApproval({
      threadId: thread.id,
      plan: { ...createPlan(), id: 'plan_2' }
    })
    await runtime.resolveApproval({ approvalId: second.id, status: 'rejected' })
    const snapshot = runtime.getSnapshot()

    expect(approved).toMatchObject({ status: 'approved', note: 'Looks good' })
    expect(snapshot.telemetry.acceptedChanges).toBe(1)
    expect(snapshot.telemetry.rejectedChanges).toBe(1)
    expect(snapshot.threads[0].status).toBe('idle')
  })

  it('supports steering and cancellation for running streams', async () => {
    const runtime = createAiAgentRuntime({
      provider: new SlowStreamingProvider([]),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })
    const thread = await runtime.createThread({ title: 'Cancelable run' })
    const { runId } = await runtime.runTurn({
      threadId: thread.id,
      content: 'Keep thinking'
    })

    expect(await runtime.steerRun(runId, 'Focus on risks')).toBe(true)
    expect(await runtime.cancelRun(runId)).toBe(true)

    await waitFor(() => runtime.getSnapshot().telemetry.runsCancelled === 1)
    const snapshot = runtime.getSnapshot()
    expect(snapshot.events.some((event) => event.type === 'run.steered')).toBe(true)
    expect(snapshot.threads[0].status).toBe('cancelled')
  })

  it('runs background jobs and records telemetry', async () => {
    const runtime = createAiAgentRuntime({
      provider: new StreamingProvider([]),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    const job = await runtime.startBackgroundJob(
      { kind: 'export', title: 'Export AI workspace' },
      async (_signal) => ({ files: 4 })
    )

    await waitFor(() => runtime.getSnapshot().telemetry.backgroundJobsCompleted === 1)
    const snapshot: AiAgentRuntimeSnapshot = runtime.getSnapshot()

    expect(snapshot.backgroundJobs.find((item) => item.id === job.id)).toMatchObject({
      status: 'completed',
      result: { files: 4 }
    })
    expect(snapshot.events.some((event) => event.type === 'background.completed')).toBe(true)
  })
})
