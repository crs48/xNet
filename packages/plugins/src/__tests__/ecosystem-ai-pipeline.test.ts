/**
 * Tests for the AI→Lab→Plugin assembly line (0194 Phase 2).
 */

import type { GeneratedScript } from '../ecosystem/ai-authoring'
import { describe, it, expect, vi } from 'vitest'
import { runAiPluginPipeline, type AiPluginPipelinePorts } from '../ecosystem/ai-pipeline'

const validScript: GeneratedScript = {
  code: 'return rows.length',
  suggestedName: 'Count Rows',
  validated: true,
  explanation: 'Counts rows'
}

function ports(overrides: Partial<AiPluginPipelinePorts> = {}): AiPluginPipelinePorts {
  return {
    generate: vi.fn().mockResolvedValue(validScript),
    runLab: vi.fn().mockResolvedValue({ ok: true, output: '3' }),
    consent: vi.fn().mockResolvedValue(true),
    publish: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

const input = { intent: 'count the rows', id: 'com.me.counter' }

describe('runAiPluginPipeline', () => {
  it('publishes when the script runs and the human approves', async () => {
    const p = ports()
    const result = await runAiPluginPipeline(input, p)
    expect(result.status).toBe('published')
    expect(p.publish).toHaveBeenCalledOnce()
    if (result.status === 'published') {
      expect(result.plugin.provenance).toBe('ai-generated')
      expect(result.run.output).toBe('3')
    }
  })

  it('runs the stages in order: generate → runLab → consent → publish', async () => {
    const calls: string[] = []
    const p = ports({
      generate: vi.fn(async () => (calls.push('generate'), validScript)),
      runLab: vi.fn(async () => (calls.push('runLab'), { ok: true })),
      consent: vi.fn(async () => (calls.push('consent'), true)),
      publish: vi.fn(async () => void calls.push('publish'))
    })
    await runAiPluginPipeline(input, p)
    expect(calls).toEqual(['generate', 'runLab', 'consent', 'publish'])
  })

  it('stops at generation-invalid for an unvalidated script (never builds a plugin)', async () => {
    const p = ports({ generate: vi.fn().mockResolvedValue({ ...validScript, validated: false }) })
    const result = await runAiPluginPipeline(input, p)
    expect(result.status).toBe('generation-invalid')
    expect(p.runLab).not.toHaveBeenCalled()
    expect(p.publish).not.toHaveBeenCalled()
  })

  it('stops at run-failed when the lab errors (never asks for consent)', async () => {
    const p = ports({ runLab: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }) })
    const result = await runAiPluginPipeline(input, p)
    expect(result.status).toBe('run-failed')
    expect(p.consent).not.toHaveBeenCalled()
    expect(p.publish).not.toHaveBeenCalled()
  })

  it('stops at declined when the human rejects (never publishes)', async () => {
    const p = ports({ consent: vi.fn().mockResolvedValue(false) })
    const result = await runAiPluginPipeline(input, p)
    expect(result.status).toBe('declined')
    expect(p.publish).not.toHaveBeenCalled()
  })
})
