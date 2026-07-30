/**
 * @xnetjs/hub - Data portability routes (exploration 0344).
 *
 * The hub-side counterpart of the `.xnetpack` bundle — "getRepo for your
 * hub data":
 *
 *   GET    /export/changes?since=&limit=  — stream the authenticated DID's
 *          signed changes across all rooms as NDJSON, paged on the
 *          per-author lamport cursor (never a scan).
 *   POST   /export/changes                — restore: NDJSON body of
 *          SerializedNodeChange records. Own-data only (a record whose
 *          authorDid differs from the token's DID is rejected — the
 *          ATProto importRepo lesson, bluesky-social/atproto#4067); each
 *          record is hash- and signature-verified before append.
 *   DELETE /export/changes                — purge every change authored by
 *          the authenticated DID (the Right-to-Leave hub-purge port).
 */

import type { AuthContext } from '../auth/ucan'
import type { HubStorage, SerializedNodeChange } from '../storage/interface'
import type { DID, ContentId } from '@xnetjs/core'
import type { Context, MiddlewareHandler } from 'hono'
import { base64ToBytes } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import { verifyChangeFast, verifyChangeHash, type Change } from '@xnetjs/sync'
import { Hono } from 'hono'
import { stream } from 'hono/streaming'

export type ExportRoutesOptions = {
  requireAuth: MiddlewareHandler
}

type NodePayload = SerializedNodeChange['payload']

const PAGE_SIZE = 1000

const deserializeChange = (serialized: SerializedNodeChange): Change<NodePayload> => {
  const payload =
    serialized.payload && !serialized.payload.schemaId && serialized.schemaId
      ? { ...serialized.payload, schemaId: serialized.schemaId as NodePayload['schemaId'] }
      : serialized.payload
  return {
    id: serialized.id,
    type: serialized.type,
    hash: serialized.hash as ContentId,
    parentHash: serialized.parentHash as ContentId | null,
    authorDID: serialized.authorDid as DID,
    signature: base64ToBytes(serialized.signatureB64),
    wallTime: serialized.wallTime,
    lamport: serialized.lamportTime,
    payload,
    protocolVersion: serialized.protocolVersion,
    batchId: serialized.batchId,
    batchIndex: serialized.batchIndex,
    batchSize: serialized.batchSize
  }
}

export const createExportRoutes = (storage: HubStorage, options: ExportRoutesOptions): Hono => {
  const app = new Hono()

  const requireAuthContext = (c: Context): AuthContext | null =>
    (c.get('auth') as AuthContext | undefined) ?? null

  // ── Export: my changes as NDJSON ──────────────────────────────────────────
  app.get('/changes', options.requireAuth, async (c) => {
    const auth = requireAuthContext(c)
    if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)

    const since = Number.parseInt(c.req.query('since') ?? '0', 10) || 0

    c.header('Content-Type', 'application/x-ndjson; charset=utf-8')
    c.header(
      'Content-Disposition',
      `attachment; filename="xnet-hub-changes-${new Date().toISOString().slice(0, 10)}.ndjson"`
    )
    const encoder = new TextEncoder()
    return stream(c, async (s) => {
      let cursor = since
      for (;;) {
        const page = await storage.getNodeChangesByAuthor(auth.did, cursor, PAGE_SIZE)
        if (page.length === 0) break
        for (const change of page) {
          await s.write(encoder.encode(`${JSON.stringify(change)}\n`))
        }
        const next = page[page.length - 1].lamportTime
        if (next <= cursor) break
        cursor = next
      }
    })
  })

  // ── Import: restore my changes from NDJSON ────────────────────────────────
  app.post('/changes', options.requireAuth, async (c) => {
    const auth = requireAuthContext(c)
    if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)

    const body = await c.req.text()
    let applied = 0
    let duplicates = 0
    const rejected: Array<{ hash?: string; reason: string }> = []

    for (const line of body.split('\n')) {
      if (line.trim().length === 0) continue
      let serialized: SerializedNodeChange
      try {
        serialized = JSON.parse(line) as SerializedNodeChange
      } catch {
        rejected.push({ reason: 'unparseable line' })
        continue
      }

      // Own-data restore only: the record's author must be the caller.
      if (serialized.authorDid !== auth.did) {
        rejected.push({ hash: serialized.hash, reason: 'author DID does not match token' })
        continue
      }
      if (typeof serialized.room !== 'string' || serialized.room.length === 0) {
        rejected.push({ hash: serialized.hash, reason: 'missing room' })
        continue
      }
      // Same relay gate as live sync: you can only write rooms you can relay.
      if (!auth.can('hub/relay', serialized.room)) {
        rejected.push({ hash: serialized.hash, reason: 'missing hub/relay for room' })
        continue
      }

      let change: Change<NodePayload>
      try {
        change = deserializeChange(serialized)
      } catch (err) {
        rejected.push({ hash: serialized.hash, reason: (err as Error).message })
        continue
      }
      if (!verifyChangeHash(change)) {
        rejected.push({ hash: serialized.hash, reason: 'hash verification failed' })
        continue
      }
      try {
        if (!(await verifyChangeFast(change, parseDID(change.authorDID)))) {
          rejected.push({ hash: serialized.hash, reason: 'signature verification failed' })
          continue
        }
      } catch (err) {
        rejected.push({ hash: serialized.hash, reason: (err as Error).message })
        continue
      }

      if (await storage.hasNodeChange(serialized.hash)) {
        duplicates++
        continue
      }
      await storage.appendNodeChange(serialized.room, serialized)
      applied++
    }

    return c.json({ applied, duplicates, rejected })
  })

  // ── Purge: the Right-to-Leave hub-purge port ──────────────────────────────
  app.delete('/changes', options.requireAuth, async (c) => {
    const auth = requireAuthContext(c)
    if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    const deleted = await storage.deleteNodeChangesByAuthor(auth.did)
    return c.json({ deleted })
  })

  return app
}
