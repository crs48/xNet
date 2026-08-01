/**
 * `xnet remember` / `forget` / `memories` / `distill` (exploration 0415).
 *
 * The pieces existed and were connected to nothing: `consolidateMemory` decides
 * ADD/UPDATE/DELETE/NOOP, `applyMemoryOp` writes `MemoryItem` nodes, and no lane
 * called either. Every coding-agent session therefore rediscovered the workspace
 * from zero.
 *
 * Two properties this deliberately keeps:
 *
 * - **Memories are ordinary nodes.** They sync, export and delete like anything
 *   else the user owns. `xnet memories` lists them; `xnet forget` removes one.
 *   A memory the user cannot see is not a memory, it is a profile.
 * - **Distillation reads, it does not capture.** `xnet distill` derives
 *   candidates from `AgentAction` instructions that already exist, requires
 *   three occurrences, and writes nothing without `--apply`.
 */

import {
  candidatesFromTraces,
  consolidateMemory,
  applyMemoryOp,
  memoryRankScore,
  rankMemories,
  type AgentActionLike,
  type MemoryRecord
} from '@xnetjs/brain'
import { Command } from 'commander'
import type { AgentCliServices, AgentCommandOptions, AgentOutputFormat } from './agent.js'

export const MEMORY_ITEM_SCHEMA_IRI = 'xnet://xnet.fyi/MemoryItem@1.0.0'
export const AGENT_ACTION_SCHEMA_IRI = 'xnet://xnet.fyi/AgentAction@1.0.0'

/** How many memories the skill preamble carries. Small on purpose. */
export const PREAMBLE_LIMIT = 8

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Load the workspace's memories as planner records. */
export async function loadMemories(services: AgentCliServices): Promise<MemoryRecord[]> {
  const nodes = await services.store.list({ schemaId: MEMORY_ITEM_SCHEMA_IRI, limit: 500 })
  const records: MemoryRecord[] = []
  for (const node of nodes) {
    if (node.deleted) continue
    const text = node.properties.text
    if (typeof text !== 'string' || !text.trim()) continue
    records.push({
      id: node.id,
      text,
      salience: typeof node.properties.salience === 'number' ? node.properties.salience : 0.5,
      lastUsedAt:
        typeof node.properties.lastUsedAt === 'number' ? node.properties.lastUsedAt : node.updatedAt
    })
  }
  return records
}

export type MemoriesOptions = { limit?: number; format?: AgentOutputFormat }

export async function runMemories(
  services: AgentCliServices,
  options: MemoriesOptions = {}
): Promise<string> {
  const now = Date.now()
  const ranked = rankMemories(await loadMemories(services), { now }).slice(0, options.limit ?? 50)
  if (options.format === 'json') return JSON.stringify({ count: ranked.length, memories: ranked })
  if (options.format === 'jsonl') return ranked.map((m) => JSON.stringify(m)).join('\n')
  if (ranked.length === 0) return 'no memories'
  return ranked
    .map((m) => `${m.id}\t${memoryRankScore(m, { now }).toFixed(3)}\t${m.text}`)
    .join('\n')
}

/**
 * The block injected ahead of a session's instructions.
 *
 * Capped and ranked by recency-decayed salience: an unbounded memory dump would
 * reintroduce the context bloat the rest of this exploration removes.
 */
export async function renderMemoryPreamble(
  services: AgentCliServices,
  limit = PREAMBLE_LIMIT
): Promise<string> {
  const ranked = rankMemories(await loadMemories(services), { now: Date.now() }).slice(0, limit)
  if (ranked.length === 0) return ''
  const lines = ranked.map((m) => `- ${m.text}`)
  return [
    '## What I remember about this workspace',
    '',
    ...lines,
    '',
    `_${ranked.length} memory item(s). \`xnet memories\` lists them; \`xnet forget <id>\` removes one._`
  ].join('\n')
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export type RememberOptions = { text: string; salience?: number; evidence?: string[] }

export async function runRemember(
  services: AgentCliServices,
  options: RememberOptions
): Promise<string> {
  const text = options.text.trim()
  if (!text) throw new Error('Nothing to remember: the text was empty')

  const existing = await loadMemories(services)
  const op = consolidateMemory(
    { text, ...(options.salience !== undefined ? { salience: options.salience } : {}) },
    existing
  )
  const applied = await applyMemoryOp(op, services.store, {
    schemaId: MEMORY_ITEM_SCHEMA_IRI,
    now: Date.now(),
    ...(options.evidence?.length ? { evidence: options.evidence } : {})
  })
  return applied.op === 'NOOP'
    ? `noop\t${applied.reason}`
    : `${applied.op.toLowerCase()}\t${applied.id}`
}

export async function runForget(services: AgentCliServices, nodeId: string): Promise<string> {
  const node = await services.store.get(nodeId)
  if (!node || node.deleted) throw new Error(`No memory with id ${nodeId}`)
  if (node.schemaId !== MEMORY_ITEM_SCHEMA_IRI) {
    // Refusing beats deleting: `forget` taking an arbitrary node id would make
    // a typo destructive well outside the memory store.
    throw new Error(`${nodeId} is not a MemoryItem (it is ${node.schemaId})`)
  }
  await services.store.delete(nodeId)
  return `deleted\t${nodeId}`
}

// ─── Distilling from traces ──────────────────────────────────────────────────

export type DistillOptions = {
  minOccurrences?: number
  limit?: number
  apply?: boolean
  format?: AgentOutputFormat
}

export async function runDistill(
  services: AgentCliServices,
  options: DistillOptions = {}
): Promise<string> {
  const actions = (await services.store.list({
    schemaId: AGENT_ACTION_SCHEMA_IRI,
    limit: 2000
  })) as unknown as AgentActionLike[]

  const candidates = candidatesFromTraces(actions, {
    ...(options.minOccurrences !== undefined ? { minOccurrences: options.minOccurrences } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {})
  })

  if (!options.apply) {
    if (options.format === 'json') return JSON.stringify({ candidates })
    if (candidates.length === 0) return 'no recurring instructions found'
    return [
      ...candidates.map((c) => `candidate\t${c.occurrences}\t${c.text}`),
      `${candidates.length} candidate(s); re-run with --apply to write them`
    ].join('\n')
  }

  const existing = await loadMemories(services)
  const lines: string[] = []
  for (const candidate of candidates) {
    const op = consolidateMemory(candidate, existing)
    const applied = await applyMemoryOp(op, services.store, {
      schemaId: MEMORY_ITEM_SCHEMA_IRI,
      now: Date.now(),
      kind: 'preference',
      evidence: candidate.evidence
    })
    lines.push(
      applied.op === 'NOOP'
        ? `noop\t${applied.reason}\t${candidate.text}`
        : `${applied.op.toLowerCase()}\t${applied.id}\t${candidate.text}`
    )
  }
  return lines.length > 0 ? lines.join('\n') : 'no recurring instructions found'
}

// ─── Registration ────────────────────────────────────────────────────────────

export type MemoryCommandDeps = {
  withServices: (
    options: AgentCommandOptions,
    fn: (services: AgentCliServices) => Promise<string>
  ) => Promise<void>
  withBackendFlags: (command: Command) => Command
  parseIntOption: (value: string) => number
}

export function registerMemoryCommands(program: Command, deps: MemoryCommandDeps): void {
  const { withServices, withBackendFlags, parseIntOption } = deps

  withBackendFlags(
    program
      .command('memories')
      .description('List what xNet remembers (TSV: id, score, text)')
      .option('-l, --limit <n>', 'Max memories', parseIntOption)
      .option('--format <format>', 'Output format: tsv|jsonl|json', 'tsv')
  ).action(async (options) => {
    await withServices(options, (services) => runMemories(services, options))
  })

  withBackendFlags(
    program
      .command('remember <text...>')
      .description('Record a durable fact or preference about this workspace')
      .option('--salience <n>', 'Initial weight, 0–1', parseFloat)
      .option('--evidence <id...>', 'Node ids this was distilled from')
  ).action(async (text: string[], options) => {
    await withServices({ ...options, forWrites: true }, (services) =>
      runRemember(services, { ...options, text: text.join(' ') })
    )
  })

  withBackendFlags(
    program.command('forget <memoryId>').description('Delete one memory by id')
  ).action(async (memoryId: string, options) => {
    await withServices({ ...options, forWrites: true }, (services) => runForget(services, memoryId))
  })

  withBackendFlags(
    program
      .command('distill')
      .description('Propose memories from recurring agent instructions (--apply to write)')
      .option('--min-occurrences <n>', 'Repetitions required (default 3)', parseIntOption)
      .option('-l, --limit <n>', 'Max candidates', parseIntOption)
      .option('--apply', 'Write the candidates through the memory planner')
      .option('--format <format>', 'Output format: tsv|json', 'tsv')
  ).action(async (options) => {
    await withServices({ ...options, forWrites: Boolean(options.apply) }, (services) =>
      runDistill(services, options)
    )
  })
}
