/**
 * Tests for exposing plugin contributions as AI tools (0194 Phase 2).
 */

import type { CommandContribution } from '../contributions'
import { describe, it, expect, vi } from 'vitest'
import { contributionsAsAiTools } from '../ai-surface/contribution-tools'

function cmd(partial: Partial<CommandContribution> & { id: string }): CommandContribution {
  return { name: partial.id, execute: () => {}, ...partial }
}

describe('contributionsAsAiTools', () => {
  it('includes only commands that explicitly opt in', () => {
    const tools = contributionsAsAiTools([
      cmd({ id: 'a', aiExposed: true }),
      cmd({ id: 'b' }), // not exposed
      cmd({ id: 'c', aiExposed: false })
    ])
    expect(tools.map((t) => t.name)).toEqual(['plugin.a'])
  })

  it('maps a command to an AiToolDefinition with sensible defaults', () => {
    const [tool] = contributionsAsAiTools([
      cmd({ id: 'export', name: 'Export CSV', description: 'Export rows', aiExposed: true })
    ])
    expect(tool.name).toBe('plugin.export')
    expect(tool.title).toBe('Export CSV')
    expect(tool.description).toBe('Export rows')
    expect(tool.risk).toBe('medium') // default
    expect(tool.requiredScopes).toEqual([]) // default
    expect(tool.inputSchema).toEqual({ type: 'object', properties: {} })
  })

  it('carries declared risk, scopes, and input schema through', () => {
    const [tool] = contributionsAsAiTools([
      cmd({
        id: 'wipe',
        aiExposed: true,
        aiRisk: 'high',
        aiScopes: ['database.write.rows'],
        aiInputSchema: {
          type: 'object',
          properties: { table: { type: 'string' } },
          required: ['table']
        }
      })
    ])
    expect(tool.risk).toBe('high')
    expect(tool.requiredScopes).toEqual(['database.write.rows'])
    expect(tool.inputSchema.required).toEqual(['table'])
  })

  it('invoke triggers execute() when no aiInvoke is declared', async () => {
    const execute = vi.fn()
    const [tool] = contributionsAsAiTools([cmd({ id: 'run', aiExposed: true, execute })])
    const result = await tool.invoke({})
    expect(execute).toHaveBeenCalledOnce()
    expect(result.content[0].text).toBe('Ran run')
  })

  it('invoke prefers aiInvoke (with args) and returns its stringified result', async () => {
    const aiInvoke = vi.fn().mockResolvedValue('42 rows')
    const execute = vi.fn()
    const [tool] = contributionsAsAiTools([
      cmd({ id: 'count', aiExposed: true, aiInvoke, execute })
    ])
    const result = await tool.invoke({ table: 'tasks' })
    expect(aiInvoke).toHaveBeenCalledWith({ table: 'tasks' })
    expect(execute).not.toHaveBeenCalled()
    expect(result.content[0].text).toBe('42 rows')
  })
})
