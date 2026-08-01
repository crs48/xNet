/**
 * The agent backend ladder (exploration 0393): the agent verbs must work
 * against a standalone SQLite store with no app / local API server running,
 * and must refuse to write under a silent ephemeral identity.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentServices, runDbGet, runSearch } from '../commands/agent.js'
import { buildDataClient, runCreateNote } from '../commands/data.js'
import {
  BackendUnavailableError,
  discoverAppDb,
  probeRemote,
  resolveAgentBackend
} from '../utils/agent-backend.js'

/** Seed a SQLite file with a couple of Notes, then close the writer. */
async function seedDb(dbPath: string, key: string): Promise<string[]> {
  const client = await buildDataClient({ db: dbPath, key })
  try {
    const a = await runCreateNote(client, { title: 'Ladder milestone', body: 'standalone backend' })
    const b = await runCreateNote(client, { title: 'Second note', body: 'more content' })
    return [a.id, b.id]
  } finally {
    await client.destroy()
  }
}

// A fixed key so the seeding identity is stable (hex of 32 bytes).
const KEY = '11'.repeat(32)

describe('agent backend ladder', () => {
  let dir: string
  let dbPath: string
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xnet-ladder-'))
    dbPath = join(dir, 'data.db')
    for (const name of ['XNET_API_URL', 'XNET_DB', 'XNET_SIGNING_KEY', 'XNET_PROFILE']) {
      savedEnv[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(dir, { recursive: true, force: true })
  })

  it('resolves a local backend from --db with no server running', async () => {
    const [firstId] = await seedDb(dbPath, KEY)
    const backend = await resolveAgentBackend({ db: dbPath, key: KEY })
    try {
      expect(backend.mode).toBe('local')
      expect(backend.description).toContain(dbPath)

      const services = createAgentServices(backend)
      const got = JSON.parse(await runDbGet(services, { nodeId: firstId }))
      expect(got.id).toBe(firstId)
      expect(got.properties.title).toBe('Ladder milestone')
    } finally {
      await backend.dispose()
    }
  })

  it('search returns FTS hits from the standalone store, and says it indexed them', async () => {
    await seedDb(dbPath, KEY)
    const backend = await resolveAgentBackend({ db: dbPath, key: KEY })
    try {
      const services = createAgentServices(backend)
      const warnings: string[] = []
      const output = await runSearch(services, { text: 'milestone', warn: (m) => warnings.push(m) })
      expect(output).toContain('Ladder milestone')
      // The whole point of 0415: a real index reports a real tier, and stays
      // silent — the warning is reserved for the case that earns it.
      expect(output.split('\n')[0]).toBe('tier\tbm25-graph')
      expect(output).toContain('index\tfts5')
      expect(warnings).toHaveLength(0)
    } finally {
      await backend.dispose()
    }
  })

  it('refuses to write under a silent ephemeral identity', async () => {
    await seedDb(dbPath, KEY)
    // forWrites + no key/agent/$XNET_SIGNING_KEY → refuse.
    await expect(resolveAgentBackend({ db: dbPath, forWrites: true })).rejects.toThrow(
      BackendUnavailableError
    )
    // A read is fine with an ephemeral identity.
    const readBackend = await resolveAgentBackend({ db: dbPath })
    await readBackend.dispose()
  })

  it('honours $XNET_SIGNING_KEY for the write identity', async () => {
    await seedDb(dbPath, KEY)
    process.env.XNET_SIGNING_KEY = KEY
    const backend = await resolveAgentBackend({ db: dbPath, forWrites: true })
    try {
      expect(backend.mode).toBe('local')
      expect(backend.description).toContain('$XNET_SIGNING_KEY')
    } finally {
      await backend.dispose()
    }
  })

  it('errors with a hint when no backend is reachable', async () => {
    // No --db, no $XNET_DB, no discoverable app db, no live API.
    process.env.XNET_API_URL = 'http://127.0.0.1:1' // nothing listens here
    process.env.XNET_PROFILE = `missing-${Date.now().toString(36)}` // no discoverable store
    await expect(resolveAgentBackend({})).rejects.toThrow(/No xNet backend found/)
  })

  it('discoverAppDb returns null when the app store is absent', async () => {
    process.env.XNET_PROFILE = `missing-${Date.now().toString(36)}`
    expect(await discoverAppDb()).toBeNull()
  })

  it('probeRemote is false for a dead port', async () => {
    expect(await probeRemote('http://127.0.0.1:1')).toBe(false)
  })
})
