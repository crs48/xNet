/**
 * Read-only tool selection for the in-app assistant (exploration 0394).
 *
 * The point of these is containment: Phase 1 hands the assistant tools, and
 * the thing that must never drift is *which* tools. A write tool reaching the
 * chat before the approval ceremony exists would be a silent capability
 * escalation, so the allow-list is asserted directly.
 */

import type { AiToolDefinition } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { READ_ONLY_TOOL_NAMES, readOnlyToolSpecs, toolsEnabledFor } from './ai-chat-tools'

function tool(name: string, risk: AiToolDefinition['risk']): AiToolDefinition {
  return {
    name,
    title: name,
    description: `does ${name}`,
    risk,
    requiredScopes: [],
    inputSchema: { type: 'object', properties: {} }
  }
}

/** A stand-in registry spanning every risk level the real one contains. */
const REGISTRY: AiToolDefinition[] = [
  tool('xnet_search', 'low'),
  tool('xnet_read_page_markdown', 'low'),
  tool('xnet_database_query', 'low'),
  tool('xnet_create_external_context_resource', 'medium'),
  tool('xnet_plan_page_patch', 'medium'),
  tool('xnet_apply_page_markdown', 'high'),
  tool('xnet_compose_page', 'high')
]

const surface = { getTools: () => REGISTRY }

describe('toolsEnabledFor', () => {
  it('only trusts tiers that call tools reliably', () => {
    expect(toolsEnabledFor('reliable')).toBe(true)
    // A weak caller emits malformed calls; given tools it invents rather than
    // grounds, which is worse than answering from the context pack.
    expect(toolsEnabledFor('weak')).toBe(false)
    expect(toolsEnabledFor('none')).toBe(false)
    expect(toolsEnabledFor(undefined)).toBe(false)
  })
})

describe('readOnlyToolSpecs', () => {
  it('advertises only the low-risk read tools on a reliable tier', () => {
    const specs = readOnlyToolSpecs(surface, 'reliable')
    expect(specs.map((spec) => spec.name)).toEqual([
      'xnet_search',
      'xnet_read_page_markdown',
      'xnet_database_query'
    ])
  })

  it('never advertises a write, plan, or network tool', () => {
    const names = readOnlyToolSpecs(surface, 'reliable').map((spec) => spec.name)
    for (const forbidden of [
      'xnet_apply_page_markdown',
      'xnet_compose_page',
      'xnet_plan_page_patch',
      'xnet_create_external_context_resource'
    ]) {
      expect(names).not.toContain(forbidden)
    }
  })

  it('requires BOTH the allow-list and a low risk rating', () => {
    // A tool on the list that the registry later reclassifies as risky must
    // drop out, not ride in on the name alone.
    const escalated = { getTools: () => [tool('xnet_search', 'high')] }
    expect(readOnlyToolSpecs(escalated, 'reliable')).toEqual([])

    // ...and a newly added low-risk tool must not appear until it is listed.
    const added = { getTools: () => [tool('xnet_brand_new_thing', 'low')] }
    expect(readOnlyToolSpecs(added, 'reliable')).toEqual([])
  })

  it('returns nothing when the tier cannot call tools', () => {
    expect(readOnlyToolSpecs(surface, 'weak')).toEqual([])
    expect(readOnlyToolSpecs(surface, 'none')).toEqual([])
  })

  it('returns nothing without a surface', () => {
    expect(readOnlyToolSpecs(null, 'reliable')).toEqual([])
  })

  it('carries the description and input schema the model needs', () => {
    const spec = readOnlyToolSpecs(surface, 'reliable')[0]
    expect(spec.description).toBe('does xnet_search')
    expect(spec.inputSchema).toEqual({ type: 'object', properties: {} })
  })

  it('keeps the allow-list free of anything that writes', () => {
    // A guard on the constant itself, independent of any registry fixture.
    for (const name of READ_ONLY_TOOL_NAMES) {
      expect(name).not.toMatch(/apply|plan|compose|create|update|delete|rollback/)
    }
  })
})
