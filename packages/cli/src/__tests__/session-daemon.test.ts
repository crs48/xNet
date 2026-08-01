/**
 * The session daemon's contract (exploration 0415).
 *
 * Two of these matter more than the happy path. A daemon that is *absent* must
 * be invisible — the verb falls back to its cold process and says nothing. A
 * daemon that is *wrong* — stale build, or killed mid-request — must be loud,
 * because both of those failure modes otherwise look exactly like a workspace
 * with nothing in it.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  connectSession,
  SessionDaemonError,
  sessionTargetFor,
  socketPathFor,
  startSessionServer,
  type SessionHandlers,
  type SessionServerHandle
} from '../utils/session-daemon.js'

const VERSION = '9.9.9'

function handlers(overrides: Partial<SessionHandlers> = {}): SessionHandlers {
  return {
    search: async (params) => ({ output: `searched:${params.text}`, warnings: [] }),
    recall: async (params) => ({ output: `recalled:${params.text}`, warnings: ['heads up'] }),
    query: async () => ({ output: 'rows', warnings: [] }),
    get: async () => ({ output: 'node', warnings: [] }),
    ...overrides
  }
}

describe('session daemon', () => {
  let dir: string
  let socketPath: string
  let server: SessionServerHandle | null = null

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xnet-session-'))
    socketPath = join(dir, 's.sock')
  })

  afterEach(async () => {
    await server?.stop().catch(() => {})
    server = null
    await rm(dir, { recursive: true, force: true })
  })

  it('serves a request over the socket', async () => {
    server = await startSessionServer({
      target: 'db:/x.db',
      version: VERSION,
      tier: 'bm25-graph',
      handlers: handlers(),
      socketPath
    })

    const client = await connectSession({ target: 'db:/x.db', version: VERSION, socketPath })
    expect(client).not.toBeNull()
    expect(client?.hello.tier).toBe('bm25-graph')
    expect(await client?.call('search', { text: 'q' })).toEqual({
      output: 'searched:q',
      warnings: []
    })
    // Warnings ride in-band: a daemon writing to its own stderr warns nobody.
    expect(await client?.call('recall', { text: 'q' })).toEqual({
      output: 'recalled:q',
      warnings: ['heads up']
    })
    client?.close()
  })

  it('returns null — silently — when no daemon is listening', async () => {
    const client = await connectSession({
      target: 'db:/x.db',
      version: VERSION,
      socketPath: join(dir, 'nothing-here.sock')
    })
    expect(client).toBeNull()
  })

  it('refuses a daemon built from a different CLI version, loudly', async () => {
    server = await startSessionServer({
      target: 'db:/x.db',
      version: '0.0.1-old',
      tier: 'scan',
      handlers: handlers(),
      socketPath
    })

    await expect(
      connectSession({ target: 'db:/x.db', version: VERSION, socketPath })
    ).rejects.toMatchObject({
      _tag: 'SessionDaemonError',
      code: 'version-mismatch'
    })
    // The message has to be actionable, not just alarming.
    await connectSession({ target: 'db:/x.db', version: VERSION, socketPath }).catch(
      (err: SessionDaemonError) => {
        expect(err.message).toContain('xnet serve')
        expect(err.message).toContain('0.0.1-old')
      }
    )
  })

  it('fails an in-flight call when the daemon dies, never resolving it empty', async () => {
    let release: (() => void) | undefined
    server = await startSessionServer({
      target: 'db:/x.db',
      version: VERSION,
      tier: 'bm25-graph',
      handlers: handlers({
        // Hangs until the test kills the server underneath it.
        search: () => new Promise((resolve) => (release = () => resolve({ output: '', warnings: [] })))
      }),
      socketPath
    })

    const client = await connectSession({ target: 'db:/x.db', version: VERSION, socketPath })
    // Attach the assertion *before* pulling the rug: the rejection lands during
    // `server.stop()`, and a handler added afterwards is an unhandled rejection
    // even though the test does handle it.
    const settled = expect(client!.call('search', { text: 'q' })).rejects.toMatchObject({
      _tag: 'SessionDaemonError',
      code: 'disconnected'
    })

    // Let the request reach the handler before killing the daemon.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await server.stop()
    server = null

    await settled
    release?.()
  })

  it('surfaces a handler error as an error, not as an empty result', async () => {
    server = await startSessionServer({
      target: 'db:/x.db',
      version: VERSION,
      tier: 'bm25-graph',
      handlers: handlers({
        search: async () => {
          throw new Error('store is closed')
        }
      }),
      socketPath
    })

    const client = await connectSession({ target: 'db:/x.db', version: VERSION, socketPath })
    await expect(client!.call('search', { text: 'q' })).rejects.toThrow('store is closed')
    client?.close()
  })

  it('refuses to start a second daemon on a live socket', async () => {
    server = await startSessionServer({
      target: 'db:/x.db',
      version: VERSION,
      tier: 'bm25-graph',
      handlers: handlers(),
      socketPath
    })
    await expect(
      startSessionServer({
        target: 'db:/x.db',
        version: VERSION,
        tier: 'bm25-graph',
        handlers: handlers(),
        socketPath
      })
    ).rejects.toThrow(/already serving/)
  })
})

describe('sessionTargetFor', () => {
  const saved = { db: process.env.XNET_DB, api: process.env.XNET_API_URL }
  afterEach(() => {
    if (saved.db === undefined) delete process.env.XNET_DB
    else process.env.XNET_DB = saved.db
    if (saved.api === undefined) delete process.env.XNET_API_URL
    else process.env.XNET_API_URL = saved.api
  })

  it('keys on the db path when one is given', () => {
    expect(sessionTargetFor({ db: '/a/data.db' })).toBe('db:/a/data.db')
    expect(sessionTargetFor({ db: '/a/data.db', agent: 'bot' })).toBe('db:/a/data.db#bot')
  })

  it('falls back to the API url, normalized', () => {
    delete process.env.XNET_DB
    expect(sessionTargetFor({ apiUrl: 'http://127.0.0.1:31415/' })).toBe('api:http://127.0.0.1:31415')
    delete process.env.XNET_API_URL
    expect(sessionTargetFor({})).toBe('api:http://127.0.0.1:31415')
  })

  it('gives different targets different sockets', () => {
    expect(socketPathFor('db:/a.db')).not.toBe(socketPathFor('db:/b.db'))
  })
})
