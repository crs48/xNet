import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHub, type HubInstance } from '../src'
import { hashHex } from '@xnet/crypto'

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
})
