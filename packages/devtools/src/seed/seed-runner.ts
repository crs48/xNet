/**
 * The seed runner — the only place that touches the store.
 *
 * Idempotency rules:
 *  - Plain nodes: deterministic IDs + LWW upsert (`importDeterministicNodes`).
 *    Re-running converges; it never duplicates.
 *  - Yjs documents: applied ONLY when the node is newly created. Re-applying a
 *    freshly-built Y.Doc would merge into duplicate blocks, so converge/reseed
 *    never rewrite existing document content.
 *  - Space-first: the demo Space + the author's owner membership are written
 *    before content so cascade authz grants the writes.
 */

import * as Y from 'yjs'
import { SpaceSchema } from '@xnetjs/data'
import type { DeterministicNodeImportDraft, NodeStore } from '@xnetjs/data'
import { autoDraft } from './auto-generator'
import { getAutoSchemas, SEEDERS } from './seed-manifest'
import {
  DEMO_PEOPLE,
  makeRng,
  pick,
  SEED_ACCRETE_PREFIX,
  seedId
} from './seed-ids'
import type {
  SeedContext,
  SeedDoc,
  SeedMode,
  SeedProgress,
  SeedReport,
  SeedScale,
  SeedScaleConfig
} from './types'

export const SCALES: Record<SeedScale, SeedScaleConfig> = {
  small: {
    scale: 'small',
    projects: 2,
    tasksPerProject: 3,
    pages: 2,
    channels: 2,
    messagesPerChannel: 5,
    observationsPerMetric: 7,
    accretePerSchema: 5
  },
  medium: {
    scale: 'medium',
    projects: 4,
    tasksPerProject: 6,
    pages: 4,
    channels: 4,
    messagesPerChannel: 15,
    observationsPerMetric: 30,
    accretePerSchema: 25
  },
  large: {
    scale: 'large',
    projects: 6,
    tasksPerProject: 12,
    pages: 6,
    channels: 6,
    messagesPerChannel: 40,
    observationsPerMetric: 90,
    accretePerSchema: 100
  }
}

/** Fixed PRNG seed so converge runs are reproducible. */
const DEFAULT_RNG_SEED = 0xc0ffee

const DEMO_SPACE_ID = seedId('space', 'demo')

export interface RunSeedOptions {
  store: NodeStore
  mode?: SeedMode
  scale?: SeedScale
  /** Subset of seeder domains to run; default all. */
  domains?: string[]
  /** Include the Tier-2 auto-coverage backstop (default true). */
  includeAuto?: boolean
  yDocRegistry?: { register(id: string, doc: Y.Doc): void } | null
  documentHistory?: { forceCapture(id: string, doc: Y.Doc): unknown } | null
  onProgress?: (p: SeedProgress) => void
  /** Override the PRNG seed (tests). */
  rngSeed?: number
  /** Override the per-run accrete nonce (tests). */
  accreteNonce?: string
}

/** Collect every draft + doc for a context (pure-ish: only `getAutoSchemas` reads the registry). */
export async function collectSeed(
  ctx: SeedContext,
  opts: { domains?: string[]; includeAuto?: boolean } = {}
): Promise<{ drafts: DeterministicNodeImportDraft[]; docs: SeedDoc[] }> {
  const drafts: DeterministicNodeImportDraft[] = []
  const docs: SeedDoc[] = []

  const selected = opts.domains
    ? SEEDERS.filter((s) => opts.domains!.includes(s.domain))
    : SEEDERS
  for (const seeder of selected) {
    const result = seeder.seed(ctx)
    drafts.push(...result.drafts)
    if (result.docs) docs.push(...result.docs)
  }

  if (opts.includeAuto !== false) {
    const autoSchemas = await getAutoSchemas()
    for (const schema of autoSchemas) {
      drafts.push(autoDraft(schema, { space: ctx.space, authorDID: ctx.authorDID }))
    }
  }

  // Last write wins on duplicate ids.
  const byId = new Map<string, DeterministicNodeImportDraft>()
  for (const d of drafts) byId.set(d.id, d)
  return { drafts: [...byId.values()], docs }
}

function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/** Run the seed. Returns a per-schema report. */
export async function runSeed(opts: RunSeedOptions): Promise<SeedReport> {
  const { store } = opts
  const mode: SeedMode = opts.mode ?? 'converge'
  const scaleKey: SeedScale = opts.scale ?? 'medium'
  const scale = SCALES[scaleKey]
  const rng = makeRng(opts.rngSeed ?? DEFAULT_RNG_SEED)
  const startedAt = Date.now()
  const progress = (phase: SeedProgress['phase'], message: string) =>
    opts.onProgress?.({ phase, message })

  // ─── 1. Space-first: create the Space, read back the author DID ──────────
  progress('resolve', 'Resolving demo workspace…')
  const resolveRes = await store.importDeterministicNodes([
    {
      id: DEMO_SPACE_ID,
      schemaId: SpaceSchema._schemaId,
      properties: { name: 'Demo Workspace', kind: 'workspace', visibility: 'private' }
    }
  ])
  const authorDID = resolveRes.nodes[0]?.createdBy ?? ''

  const ctx: SeedContext = {
    space: DEMO_SPACE_ID,
    authorDID,
    people: DEMO_PEOPLE,
    scale,
    rng
  }

  // ─── 2. Collect drafts + docs ───────────────────────────────────────────
  progress('collect', 'Building seed data…')
  const { drafts, docs } = await collectSeed(ctx, {
    domains: opts.domains,
    includeAuto: opts.includeAuto
  })
  if (mode === 'accrete') {
    drafts.push(...buildAccreteDrafts(ctx, opts.accreteNonce))
  }

  // ─── 3. Per-schema tally + reseed teardown ──────────────────────────────
  const allIds = drafts.map((d) => d.id)
  const existing = new Set(await store.getExistingNodeIds(allIds))

  let reseedDeleted: string[] = []
  if (mode === 'reseed') {
    reseedDeleted = await store.getExistingNodeIds(allIds)
    for (const id of reseedDeleted) await store.delete(id as never)
  }

  const perSchema: SeedReport['perSchema'] = {}
  let created = 0
  let updated = 0
  for (const d of drafts) {
    const tally = (perSchema[d.schemaId] ??= { created: 0, updated: 0 })
    if (existing.has(d.id) && mode !== 'reseed') {
      tally.updated++
      updated++
    } else {
      tally.created++
      created++
    }
  }

  // ─── 4. Idempotent batch import ─────────────────────────────────────────
  progress('import', `Importing ${drafts.length} nodes…`)
  for (const batch of chunk(drafts, 250)) {
    await store.importDeterministicNodes(batch, { indexMode: 'defer-schema' })
  }

  // reseed: nodes were soft-deleted; bring them back live.
  if (mode === 'reseed') {
    for (const id of reseedDeleted) await store.restore(id as never)
  }

  // ─── 5. Yjs docs — only for newly-created nodes (idempotency-safe) ───────
  progress('docs', 'Applying documents…')
  let docsApplied = 0
  for (const doc of docs) {
    const isNew = !existing.has(doc.nodeId) && mode !== 'reseed'
    if (!isNew) continue
    const ydoc = doc.build()
    await store.setDocumentContent(doc.nodeId as never, Y.encodeStateAsUpdate(ydoc))
    opts.documentHistory?.forceCapture(doc.nodeId, ydoc)
    opts.yDocRegistry?.register(doc.nodeId, ydoc)
    docsApplied++
  }

  // ─── 6. Rebuild deferred indexes ────────────────────────────────────────
  progress('index', 'Rebuilding indexes…')
  const affectedSchemas = [...new Set(drafts.map((d) => d.schemaId))]
  try {
    await store.rebuildIndexesForSchemas(affectedSchemas)
    await store.analyze()
  } catch {
    // Index maintenance is best-effort on adapters that don't support it.
  }

  progress('done', 'Seed complete')
  return {
    mode,
    scale: scaleKey,
    created,
    updated,
    docsApplied,
    perSchema,
    durationMs: Date.now() - startedAt
  }
}

/**
 * Random-ID volume nodes for scale/perf testing. Intentionally non-idempotent:
 * each run appends a fresh batch (keyed by a per-run nonce) onto existing
 * projects / channels / metrics.
 */
function buildAccreteDrafts(ctx: SeedContext, nonceOverride?: string): DeterministicNodeImportDraft[] {
  const nonce = nonceOverride ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  const drafts: DeterministicNodeImportDraft[] = []
  const TASK = 'xnet://xnet.fyi/Task@1.0.0'
  const project = seedId('project', 'Website Redesign')

  for (let i = 0; i < ctx.scale.accretePerSchema; i++) {
    drafts.push({
      id: `${SEED_ACCRETE_PREFIX}/task/${nonce}/${i}`,
      schemaId: TASK,
      properties: {
        title: `Volume task ${nonce}-${i}`,
        status: 'todo',
        priority: pick(ctx.rng, ['low', 'medium', 'high']),
        project,
        space: ctx.space
      }
    })
  }
  return drafts
}

export { DEMO_SPACE_ID }
