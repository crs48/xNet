/**
 * Serialize the curated seed graph to a portable JSON snapshot — a fast,
 * deterministic fixture for E2E or for importing without re-running the seeders.
 * Yjs documents are encoded as base64 updates.
 */

import type { SeedScale } from './types'
import * as Y from 'yjs'
import { makeRng, DEMO_PEOPLE, seedId } from './seed-ids'
import { collectSeed, SCALES } from './seed-runner'

export interface SeedSnapshot {
  version: 1
  scale: SeedScale
  drafts: Array<{ id: string; schemaId: string; properties: Record<string, unknown> }>
  docs: Array<{ nodeId: string; update: string }>
}

function encodeUpdate(doc: Y.Doc): string {
  const bytes = Y.encodeStateAsUpdate(doc)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number)
  return btoa(s)
}

/** Build a JSON snapshot of the curated seed graph (no store required). */
export async function buildSnapshot(
  opts: {
    authorDID?: string
    scale?: SeedScale
    includeAuto?: boolean
  } = {}
): Promise<SeedSnapshot> {
  const scale = opts.scale ?? 'small'
  const ctx = {
    space: seedId('space', 'demo'),
    authorDID: opts.authorDID ?? 'did:key:zSeedSnapshotAuthor',
    people: DEMO_PEOPLE,
    scale: SCALES[scale],
    rng: makeRng(0xc0ffee)
  }
  const { drafts, docs } = await collectSeed(ctx, { includeAuto: opts.includeAuto })
  return {
    version: 1,
    scale,
    drafts: drafts.map((d) => ({ id: d.id, schemaId: d.schemaId, properties: d.properties })),
    docs: docs.map((d) => ({ nodeId: d.nodeId, update: encodeUpdate(d.build()) }))
  }
}
