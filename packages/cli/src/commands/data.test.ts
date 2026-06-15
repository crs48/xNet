/**
 * Tests for `xnet data` — proves the runtime client works in a plain Node
 * process (no DOM, no React), backed by an in-memory SQLite database.
 */
import { describe, expect, it } from 'vitest'
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
})
