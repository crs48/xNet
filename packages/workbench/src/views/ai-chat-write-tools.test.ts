/**
 * Write tools are doubly gated (0394 Phase 2): the tier must call tools
 * reliably AND the operator must have opted in — either alone yields nothing.
 */

import type { AiSurfaceService, AiToolDefinition } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { WRITE_TOOL_NAMES, writesEnabledFor, writeToolSpecs } from './ai-chat-write-tools'

const surface = {
  getTools: () =>
    [
      { name: 'xnet_search', risk: 'low', description: 'search', inputSchema: {} },
      { name: 'xnet_plan_page_patch', risk: 'medium', description: 'plan', inputSchema: {} },
      { name: 'xnet_apply_page_markdown', risk: 'high', description: 'apply', inputSchema: {} },
      { name: 'xnet_compose_page', risk: 'high', description: 'compose', inputSchema: {} },
      // A write-shaped tool NOT on the allow-list must never leak through.
      { name: 'xnet_apply_database_mutation', risk: 'high', description: 'db', inputSchema: {} }
    ] as unknown as AiToolDefinition[]
} as Pick<AiSurfaceService, 'getTools'>

describe('writeToolSpecs', () => {
  it('returns the allow-listed cluster for an opted-in reliable tier', () => {
    const names = writeToolSpecs(surface, 'reliable', true).map((t) => t.name)
    expect(names).toEqual(['xnet_plan_page_patch', 'xnet_apply_page_markdown', 'xnet_compose_page'])
    expect(names).not.toContain('xnet_apply_database_mutation')
    expect(names).not.toContain('xnet_search')
  })

  it('yields nothing without the opt-in, whatever the tier', () => {
    expect(writeToolSpecs(surface, 'reliable', false)).toEqual([])
  })

  it('yields nothing for propose-only tiers, even opted in', () => {
    expect(writeToolSpecs(surface, 'weak', true)).toEqual([])
    expect(writeToolSpecs(surface, 'none', true)).toEqual([])
    expect(writeToolSpecs(surface, undefined, true)).toEqual([])
    expect(writeToolSpecs(null, 'reliable', true)).toEqual([])
  })

  it('mirrors writeModeFor: only reliable is agentic', () => {
    expect(writesEnabledFor('reliable')).toBe(true)
    expect(writesEnabledFor('weak')).toBe(false)
    expect(writesEnabledFor('none')).toBe(false)
    expect(writesEnabledFor(undefined)).toBe(false)
  })

  it('every allow-listed name stays explicit', () => {
    expect([...WRITE_TOOL_NAMES]).toEqual([
      'xnet_validate_page_markdown',
      'xnet_plan_page_patch',
      'xnet_apply_page_markdown',
      'xnet_compose_page'
    ])
  })
})
