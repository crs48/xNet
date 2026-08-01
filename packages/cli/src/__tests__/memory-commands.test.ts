/**
 * Memory verbs (exploration 0415).
 *
 * The pieces — `consolidateMemory`, `applyMemoryOp`, the `MemoryItem` schema —
 * all existed and nothing called them. These tests cover the two properties
 * that make the wiring defensible: memories are visible and deletable, and
 * distillation reads a trail that already exists rather than capturing anything
 * new.
 */

import { createMemoryNodeStore, createWorkspaceFixtureSchemas } from '@xnetjs/plugins/node'
import { describe, expect, it } from 'vitest'
import { createAgentServices, type AgentCliServices } from '../commands/agent.js'
import {
  AGENT_ACTION_SCHEMA_IRI,
  loadMemories,
  MEMORY_ITEM_SCHEMA_IRI,
  renderMemoryPreamble,
  runDistill,
  runForget,
  runMemories,
  runRemember
} from '../commands/memory.js'

function action(id: string, instruction: string, status = 'succeeded') {
  return {
    id,
    schemaId: AGENT_ACTION_SCHEMA_IRI,
    properties: { instruction, status, tool: 'xnet_update', session: 's', seq: 1 },
    deleted: false,
    createdAt: 1,
    updatedAt: 1
  }
}

function services(nodes: ReturnType<typeof action>[] = []): AgentCliServices {
  return createAgentServices({
    store: createMemoryNodeStore(nodes),
    schemas: createWorkspaceFixtureSchemas()
  })
}

describe('xnet remember / memories / forget', () => {
  it('records a memory and lists it', async () => {
    const s = services()
    const result = await runRemember(s, { text: 'File Acme invoices under Ops' })
    expect(result).toMatch(/^add\t/)

    const listed = await runMemories(s)
    expect(listed).toContain('File Acme invoices under Ops')

    const records = await loadMemories(s)
    expect(records).toHaveLength(1)
  })

  it('consolidates a restatement instead of piling up duplicates', async () => {
    const s = services()
    await runRemember(s, { text: 'File Acme invoices under Ops' })
    const second = await runRemember(s, { text: 'File Acme invoices under Ops' })
    expect(second).toMatch(/^noop\t/)
    expect(await loadMemories(s)).toHaveLength(1)
  })

  it('forgets a memory by id', async () => {
    const s = services()
    const added = await runRemember(s, { text: 'Prefer TSV output' })
    const id = added.split('\t')[1]
    expect(await runForget(s, id)).toBe(`deleted\t${id}`)
    expect(await loadMemories(s)).toHaveLength(0)
  })

  it('refuses to forget a node that is not a memory', async () => {
    const s = services([action('a1', 'do a thing')])
    // A typo here would otherwise delete arbitrary workspace data.
    await expect(runForget(s, 'a1')).rejects.toThrow(/not a MemoryItem/)
    await expect(runForget(s, 'nope')).rejects.toThrow(/No memory with id/)
  })

  it('renders an empty preamble when there is nothing to say', async () => {
    expect(await renderMemoryPreamble(services())).toBe('')
  })

  it('merges near-identical phrasings rather than hoarding them', async () => {
    const s = services()
    await runRemember(s, { text: 'Prefer TSV output for tables' })
    await runRemember(s, { text: 'For tables, prefer TSV output please' })
    expect(await loadMemories(s)).toHaveLength(1)
  })

  it('caps the preamble so memory cannot re-bloat the context', async () => {
    const s = services()
    const facts = [
      'File Acme invoices under Ops',
      'Deploy windows are Tuesday mornings',
      'The staging database resets nightly',
      'Marta owns the billing integration',
      'Never touch the legacy importer without a backup',
      'Quarterly reviews land in the Planning space',
      'Customer emails route through the Support channel',
      'Release notes need a changelog fragment',
      'The design system lives in packages ui',
      'Incidents get a postmortem within a week'
    ]
    for (const text of facts) await runRemember(s, { text })
    expect(await loadMemories(s)).toHaveLength(facts.length)

    const preamble = await renderMemoryPreamble(s, 8)
    expect(preamble.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(8)
    expect(preamble).toContain('xnet forget')
  })
})

describe('xnet distill', () => {
  const repeated = [
    action('a1', 'always file these under Ops'),
    action('a2', 'always file these under Ops'),
    action('a3', 'under Ops, always file these')
  ]

  it('proposes nothing below the recurrence threshold', async () => {
    const s = services(repeated.slice(0, 2))
    expect(await runDistill(s)).toBe('no recurring instructions found')
  })

  it('proposes a candidate at three occurrences, and writes nothing without --apply', async () => {
    const s = services(repeated)
    const output = await runDistill(s)
    expect(output).toMatch(/^candidate\t3\t/m)
    expect(output).toContain('re-run with --apply')
    expect(await loadMemories(s)).toHaveLength(0)
  })

  it('writes through the memory planner with --apply, carrying its evidence', async () => {
    const s = services(repeated)
    const output = await runDistill(s, { apply: true })
    expect(output).toMatch(/^add\t/)

    const nodes = await s.store.list({ schemaId: MEMORY_ITEM_SCHEMA_IRI })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].properties.kind).toBe('preference')
    expect(nodes[0].properties.evidence).toEqual(['a1', 'a2', 'a3'])
  })

  it('ignores one-off task instructions', async () => {
    const s = services([...repeated, action('b1', 'delete the Henderson file')])
    const output = await runDistill(s)
    expect(output).not.toContain('Henderson')
  })

  it('ignores redacted instructions rather than guessing at them', async () => {
    const redacted = '[redacted 42 chars sha256:abcdef0123456789]'
    const s = services([action('r1', redacted), action('r2', redacted), action('r3', redacted)])
    expect(await runDistill(s)).toBe('no recurring instructions found')
  })
})
