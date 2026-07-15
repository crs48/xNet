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

import type {
  SeedContext,
  SeedDoc,
  SeedMode,
  SeedProgress,
  SeedReport,
  SeedScale,
  SeedScaleConfig
} from './types'
import type { DeterministicNodeImportDraft, NodeId, NodeStore } from '@xnetjs/data'
import { DRAFT_SCHEMA_IRI, SpaceSchema } from '@xnetjs/data'
import { discardDraft, forkNodeIntoDraft } from '@xnetjs/history'
import * as Y from 'yjs'
import { autoDraft } from './auto-generator'
import { buildFixtures, ORG_SPACE_ID } from './fixtures'
import { DEMO_PEOPLE, makeRng, pick, SEED_ACCRETE_PREFIX, seedId } from './seed-ids'
import { getAutoSchemas, SEEDERS } from './seed-manifest'

export const SCALES: Record<SeedScale, SeedScaleConfig> = {
  small: {
    scale: 'small',
    projects: 2,
    tasksPerProject: 3,
    pages: 3,
    channels: 2,
    messagesPerChannel: 5,
    observationsPerMetric: 7,
    dbRows: 6,
    orgs: 3,
    contactsPerOrg: 2,
    deals: 3,
    transactions: 4,
    feedItems: 4,
    accretePerSchema: 5
  },
  medium: {
    scale: 'medium',
    projects: 4,
    tasksPerProject: 6,
    pages: 5,
    channels: 4,
    messagesPerChannel: 15,
    observationsPerMetric: 30,
    dbRows: 18,
    orgs: 6,
    contactsPerOrg: 3,
    deals: 8,
    transactions: 10,
    feedItems: 10,
    accretePerSchema: 25
  },
  large: {
    scale: 'large',
    projects: 6,
    tasksPerProject: 12,
    pages: 8,
    channels: 6,
    messagesPerChannel: 40,
    observationsPerMetric: 90,
    dbRows: 60,
    orgs: 12,
    contactsPerOrg: 5,
    deals: 24,
    transactions: 40,
    feedItems: 30,
    accretePerSchema: 100
  }
}

/** Fixed PRNG seed so converge runs are reproducible. */
const DEFAULT_RNG_SEED = 0xc0ffee

/** The org space id (kept stable so prior seeds converge). */
const DEMO_SPACE_ID = ORG_SPACE_ID

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

  const selected = opts.domains ? SEEDERS.filter((s) => opts.domains!.includes(s.domain)) : SEEDERS
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
    fixtures: buildFixtures(),
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

  // ─── 5b. Agent-PR demo draft (exploration 0329 P4) ────────────────────────
  // An "assistant" draft awaiting review on the sample page: forked member,
  // AI-edited clone, reviewRequested — end-to-end food for the Requests
  // surface, the Draft switcher, and the review panel. Idempotent: skipped
  // when the demo draft already exists (converge re-runs add nothing).
  progress('docs', 'Seeding agent draft demo…')
  try {
    await seedAgentDraftDemo(store, mode)
  } catch (err) {
    // The demo is garnish — never fail a seed over it.
    console.warn('[seed] agent draft demo skipped:', err)
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
function buildAccreteDrafts(
  ctx: SeedContext,
  nonceOverride?: string
): DeterministicNodeImportDraft[] {
  const nonce =
    nonceOverride ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
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

/** Stable id for the seeded agent-PR demo draft (0329 P4). */
export const DEMO_AGENT_DRAFT_ID = seedId('draft', 'agent-demo') as NodeId

/**
 * Seed the agent-PR demo: an assistant draft on the sample page with one
 * forked member, an AI-edited clone, and reviewRequested set. Skipped when
 * present (converge); recreated after teardown on reseed.
 */
async function seedAgentDraftDemo(store: NodeStore, mode: SeedMode): Promise<void> {
  const storage = store.getStorageAdapter()
  const existing = await store.getRaw(DEMO_AGENT_DRAFT_ID)
  if (existing && !existing.deleted) {
    if (mode !== 'reseed') return
    // Reseed: tear the demo down (clones + pins) before recreating.
    await discardDraft(store, storage, DEMO_AGENT_DRAFT_ID)
    await store.delete(DEMO_AGENT_DRAFT_ID)
  }

  const samplePageId = seedId('page', 'sample') as NodeId
  const page = await store.getRaw(samplePageId)
  if (!page || page.deleted) return // docs domain not seeded — nothing to demo

  if (existing?.deleted) await store.restore(DEMO_AGENT_DRAFT_ID)
  const draftExists = await store.getRaw(DEMO_AGENT_DRAFT_ID)
  if (!draftExists || draftExists.deleted) {
    await store.create({
      id: DEMO_AGENT_DRAFT_ID,
      schemaId: DRAFT_SCHEMA_IRI as never,
      properties: {
        name: 'AI: tighten the sample page intro',
        status: 'open',
        target: samplePageId,
        entries: {},
        created: [],
        deletedIds: []
      }
    })
  }
  store.markDraftPrivate([DEMO_AGENT_DRAFT_ID])

  const entry = await forkNodeIntoDraft(store, storage, DEMO_AGENT_DRAFT_ID, samplePageId)
  await store.update(entry.cloneId as NodeId, {
    properties: {
      title: `${String(page.properties.title ?? 'Sample page')} — AI edit pending review`
    }
  })
  await store.update(DEMO_AGENT_DRAFT_ID, { properties: { reviewRequested: true } })
}
