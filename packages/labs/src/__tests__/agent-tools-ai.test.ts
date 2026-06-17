/**
 * Tests for adapting Lab agent tools to AI tools (0194 Phase 2).
 */

import type { LabAgentTool } from '../agent-tools'
import { describe, it, expect, vi } from 'vitest'
import { labAgentToolsToAiTools } from '../agent-tools-ai'

function labTool(name: string, invoke = vi.fn().mockResolvedValue('ok')): LabAgentTool {
  return {
    name,
    description: `The ${name} tool`,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    invoke
  }
}

describe('labAgentToolsToAiTools', () => {
  it('adapts name/title/description and passes the input schema through', () => {
    const [tool] = labAgentToolsToAiTools([labTool('lab_run')])
    expect(tool.name).toBe('lab_run')
    expect(tool.title).toBe('Lab run')
    expect(tool.description).toBe('The lab_run tool')
    expect(tool.inputSchema.properties.id).toEqual({ type: 'string' })
    expect(tool.requiredScopes).toEqual(['workspace.read'])
  })

  it('marks execution tools high risk and read tools low risk', () => {
    const tools = labAgentToolsToAiTools([
      labTool('lab_run'),
      labTool('lab_create'),
      labTool('lab_run_saved'),
      labTool('lab_get'),
      labTool('lab_list')
    ])
    const risk = Object.fromEntries(tools.map((t) => [t.name, t.risk]))
    expect(risk).toEqual({
      lab_run: 'high',
      lab_create: 'high',
      lab_run_saved: 'high',
      lab_get: 'low',
      lab_list: 'low'
    })
  })

  it('invoke calls the underlying tool and wraps the result as text content', async () => {
    const invoke = vi.fn().mockResolvedValue({ rows: 3 })
    const [tool] = labAgentToolsToAiTools([labTool('lab_run', invoke)])
    const result = await tool.invoke({ code: 'x' })
    expect(invoke).toHaveBeenCalledWith({ code: 'x' })
    expect(result.content).toEqual([{ type: 'text', text: '{"rows":3}' }])
  })

  it('passes a string result through unchanged', async () => {
    const [tool] = labAgentToolsToAiTools([labTool('lab_get', vi.fn().mockResolvedValue('hello'))])
    const result = await tool.invoke({ id: '1' })
    expect(result.content[0].text).toBe('hello')
  })
})
