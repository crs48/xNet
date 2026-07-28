/**
 * Context-tool registry (explorations 0327/0329): resolution is
 * specific-before-wildcard, registry order breaks ties, and unrelated
 * schemas match nothing but wildcards.
 */
import { describe, expect, it } from 'vitest'
import { CONTEXT_TOOLS, contextToolsForSchema, type ContextToolDef } from './context-tools'

const PAGE = 'xnet://xnet.fyi/Page@1.0.0'
const TASK = 'xnet://xnet.fyi/Task@1.0.0'

function tool(id: string, supportedSchemas: ContextToolDef['supportedSchemas']): ContextToolDef {
  return { id, title: id, icon: 'wrench', supportedSchemas, render: () => null }
}

describe('contextToolsForSchema', () => {
  const registry = [
    tool('wildcard-first', '*'),
    tool('page-only', [PAGE]),
    tool('page-and-task', [PAGE, TASK]),
    tool('wildcard-second', '*')
  ]

  it('orders specific tools before wildcard tools', () => {
    expect(contextToolsForSchema(PAGE, registry).map((t) => t.id)).toEqual([
      'page-only',
      'page-and-task',
      'wildcard-first',
      'wildcard-second'
    ])
  })

  it('matches only wildcards for a schema no tool names', () => {
    expect(
      contextToolsForSchema('xnet://xnet.fyi/Expense@1.0.0', registry).map((t) => t.id)
    ).toEqual(['wildcard-first', 'wildcard-second'])
  })

  it('matches list membership per schema', () => {
    const ids = contextToolsForSchema(TASK, registry).map((t) => t.id)
    expect(ids).toContain('page-and-task')
    expect(ids).not.toContain('page-only')
  })

  it('the built-in registry leads with the Time Machine for every schema', () => {
    // Wildcard registration (0329): every node has a change log, so every
    // focused node gets a History tab.
    expect(CONTEXT_TOOLS[0]?.id).toBe('time-machine')
    expect(contextToolsForSchema('xnet://xnet.fyi/Anything@1.0.0')[0]?.id).toBe('time-machine')
  })
})
