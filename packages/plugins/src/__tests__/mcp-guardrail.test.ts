/**
 * Tests for the MCP write guardrail (exploration 0175).
 */

import { describe, expect, it } from 'vitest'
import { McpWriteGuardrail } from '../services/mcp-guardrail'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'
const CHAT = 'xnet://xnet.fyi/ChatMessage@1.0.0'

describe('McpWriteGuardrail', () => {
  it('allows an ordinary create (low risk, no confirmation)', () => {
    const g = new McpWriteGuardrail()
    const verdict = g.evaluate({ kind: 'create', schemaId: TASK })
    expect(verdict.decision).toBe('allow')
    if (verdict.decision === 'allow') expect(verdict.risk).toBe('low')
  })

  it('allows an ordinary update', () => {
    const g = new McpWriteGuardrail()
    expect(g.evaluate({ kind: 'update', nodeId: 'n1' }).decision).toBe('allow')
  })

  it('requires confirmation to delete (high risk)', () => {
    const g = new McpWriteGuardrail()
    const verdict = g.evaluate({ kind: 'delete', nodeId: 'n1' })
    expect(verdict.decision).toBe('needs-confirmation')
    if (verdict.decision === 'needs-confirmation') expect(verdict.risk).toBe('high')
  })

  it('allows a delete once confirmed', () => {
    const g = new McpWriteGuardrail()
    expect(g.evaluate({ kind: 'delete', nodeId: 'n1', confirm: true }).decision).toBe('allow')
  })

  it('treats creating a chat message as outward-facing → needs confirmation', () => {
    const g = new McpWriteGuardrail()
    const verdict = g.evaluate({ kind: 'create', schemaId: CHAT })
    expect(verdict.decision).toBe('needs-confirmation')
    if (verdict.decision === 'needs-confirmation') expect(verdict.outwardFacing).toBe(true)
  })

  it('sends the message once confirmed', () => {
    const g = new McpWriteGuardrail()
    expect(g.evaluate({ kind: 'create', schemaId: CHAT, confirm: true }).decision).toBe('allow')
  })

  it('blocks writes once the cost budget is exhausted', () => {
    const g = new McpWriteGuardrail({
      budgetPolicy: { limits: [{ scope: 'surface', unitsPerWindow: 2, windowMs: 60_000 }] }
    })
    expect(g.evaluate({ kind: 'create', schemaId: TASK }).decision).toBe('allow')
    expect(g.evaluate({ kind: 'create', schemaId: TASK }).decision).toBe('allow')
    const third = g.evaluate({ kind: 'create', schemaId: TASK })
    expect(third.decision).toBe('blocked')
    if (third.decision === 'blocked') expect(third.reason).toMatch(/budget/)
  })

  it('does not charge the budget for an unconfirmed (gated) write', () => {
    const g = new McpWriteGuardrail({
      budgetPolicy: { limits: [{ scope: 'surface', unitsPerWindow: 1, windowMs: 60_000 }] }
    })
    // A delete is gated before charging; the budget unit stays available.
    expect(g.evaluate({ kind: 'delete', nodeId: 'n1' }).decision).toBe('needs-confirmation')
    expect(g.evaluate({ kind: 'create', schemaId: TASK }).decision).toBe('allow')
  })

  it('computes an AI provenance evidence ref when provenance is supplied', () => {
    const g = new McpWriteGuardrail()
    const verdict = g.evaluate({
      kind: 'create',
      schemaId: TASK,
      provenance: { sourceType: 'cloud-ai', modelProvider: 'anthropic', modelName: 'claude-opus' }
    })
    expect(verdict.decision).toBe('allow')
    if (verdict.decision === 'allow') {
      expect(verdict.provenanceRef).toContain('ai-provenance')
      expect(verdict.provenanceRef).toContain('anthropic')
    }
  })

  it('records applied writes in the audit log', () => {
    const g = new McpWriteGuardrail()
    const verdict = g.evaluate({ kind: 'create', schemaId: TASK })
    if (verdict.decision === 'allow')
      g.recordApplied({ kind: 'create', schemaId: TASK }, verdict, 'task-1')
    const log = g.getAuditLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ kind: 'create', risk: 'low', nodeId: 'task-1' })
  })
})
