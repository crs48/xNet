import type { AuthContext } from '../src/auth/ucan'
import { hashHex } from '@xnetjs/crypto'
import { Hono } from 'hono'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHub, type HubInstance } from '../src'
import { createFileRoutes } from '../src/routes/files'
import { FileService } from '../src/services/files'
import { createMemoryStorage } from '../src/storage/memory'

describe('File Storage API', () => {
  let hub: HubInstance
  const PORT = 14452
  const BASE = `http://localhost:${PORT}`

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('uploads and downloads a file', async () => {
    const data = new TextEncoder().encode('Hello, World!')
    const cid = `cid:blake3:${hashHex(data)}`

    const putRes = await fetch(`${BASE}/files/${cid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'X-File-Name': 'hello.txt'
      },
      body: data
    })

    expect(putRes.status).toBe(201)
    const meta = await putRes.json()
    expect(meta.cid).toBe(cid)
    expect(meta.sizeBytes).toBe(data.length)

    const headRes = await fetch(`${BASE}/files/${cid}`, { method: 'HEAD' })
    expect(headRes.status).toBe(200)
    expect(headRes.headers.get('Content-Type')).toBe('text/plain')

    const getRes = await fetch(`${BASE}/files/${cid}`)
    expect(getRes.status).toBe(200)
    const text = await getRes.text()
    expect(text).toBe('Hello, World!')

    const listRes = await fetch(`${BASE}/files`)
    expect(listRes.status).toBe(200)
    const list = await listRes.json()
    expect(list.files.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects oversized uploads from content-length before storage work', async () => {
    const fileService = new FileService(createMemoryStorage(), { maxFileSize: 8 })
    const app = new Hono<{ Variables: { auth: AuthContext } }>()
    const cid = 'cid:blake3:not-used'

    app.use('*', async (c, next) => {
      c.set('auth', { did: 'did:key:tester', can: () => true })
      await next()
    })
    app.route('/files', createFileRoutes(fileService))

    const response = await app.request(`/files/${cid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': '9',
        'X-File-Name': 'too-large.txt'
      },
      body: new Uint8Array(9)
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'FILE_TOO_LARGE' })
    expect(await fileService.getMeta(cid)).toBeNull()
  })
})
