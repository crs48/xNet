/**
 * Tests for `xnet data` — proves the runtime client works in a plain Node
 * process (no DOM, no React), backed by an in-memory SQLite database.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sign } from '@xnetjs/crypto'
import { applyBundle, verifyBundle, writeBundle } from '@xnetjs/data'
import { afterAll, describe, expect, it } from 'vitest'
import { FsBundleSink, FsBundleSource } from '../utils/fs-bundle'
import { buildDataClient, runCreateNote, runListNotes } from './data'

describe('xnet data (runtime-backed CLI)', () => {
  it('creates and lists notes through createXNetClient + SQLite', async () => {
    const client = await buildDataClient() // in-memory SQLite, ephemeral identity
    try {
      expect(client.authorDID).toMatch(/^did:key:/)

      const created = await runCreateNote(client, { title: 'hello', body: 'from the CLI' })
      expect(created.id).toBeTruthy()
      expect(created.properties.title).toBe('hello')

      const notes = await runListNotes(client)
      expect(notes).toHaveLength(1)
      expect(notes[0].properties.body).toBe('from the CLI')
    } finally {
      await client.destroy()
    }
  })

  it('derives a stable DID from a provided signing key', async () => {
    // 32-byte hex key → deterministic DID.
    const key = '11'.repeat(32)
    const a = await buildDataClient({ key })
    const b = await buildDataClient({ key })
    try {
      expect(a.authorDID).toBe(b.authorDID)
    } finally {
      await a.destroy()
      await b.destroy()
    }
  })

  describe('xnet data export / import (.xnetpack on disk)', () => {
    const cleanups: string[] = []
    afterAll(async () => {
      for (const dir of cleanups) await rm(dir, { recursive: true, force: true })
    })

    it('round-trips a bundle through a directory on disk', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'xnetpack-'))
      cleanups.push(dir)
      const key = '22'.repeat(32)
      const keyBytes = new Uint8Array(Buffer.from(key, 'hex'))

      const a = await buildDataClient({ key })
      try {
        await runCreateNote(a, { title: 'exported note', body: 'travels by thumb drive' })
        const manifest = await writeBundle(a.store, { kind: 'full' }, new FsBundleSink(dir), {
          ownerDid: a.authorDID,
          manifestSigner: (bytes) => sign(bytes, keyBytes)
        })
        expect(manifest.counts.changes).toBeGreaterThan(0)
      } finally {
        await a.destroy()
      }

      const source = new FsBundleSource(dir)
      const report = await verifyBundle(source)
      expect(report.ok).toBe(true)

      const b = await buildDataClient({ key }) // same identity, fresh store
      try {
        const result = await applyBundle(b.store, source, { importerDid: b.authorDID })
        expect(result.applied).toBeGreaterThan(0)
        expect(result.quarantined).toEqual([])
        const notes = await runListNotes(b)
        expect(notes).toHaveLength(1)
        expect(notes[0].properties.title).toBe('exported note')
      } finally {
        await b.destroy()
      }
    })
  })
})
