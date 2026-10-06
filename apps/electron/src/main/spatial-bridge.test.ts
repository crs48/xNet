import { describe, expect, it, vi } from 'vitest'
import { fixtureAdapter } from '../spatial/fixtures'
import { createSpatialBridge } from './spatial-bridge'

const origin = 'https://mac.example:8443'
async function setup() {
  let clock = 1000
  const adapter = fixtureAdapter(10),
    signal = new AbortController().signal
  const reader = {
    snapshot: await adapter.snapshot(signal),
    detail: vi.fn((id: string) => adapter.detail(id, signal)),
    thumbnail: vi.fn(async () => ({ data: new Uint8Array([1]), contentType: 'image/png' }))
  }
  const original = JSON.stringify(reader.snapshot)
  const bridge = createSpatialBridge(reader, origin, () => clock)
  const request = (path: string, token = '', method = 'GET', source = origin) =>
    bridge.handle(
      new Request(origin + path, {
        method,
        headers: { Origin: source, Authorization: `Bearer ${token}` }
      })
    )
  const paired = await request('/pair', bridge.invitation, 'POST')
  const { token } = (await paired.json()) as { token: string }
  return {
    bridge,
    reader,
    request,
    token,
    original,
    time: (n: number) => {
      clock += n
    }
  }
}
describe('scoped spatial pairing', () => {
  it('requires a single-use invitation and never accepts the general API token', async () => {
    const { bridge, request, token } = await setup()
    expect((await request('/pair', bridge.invitation, 'POST')).status).toBe(401)
    expect((await request('/api/snapshot')).status).toBe(401)
    expect((await request('/api/snapshot', 'general-api-token')).status).toBe(401)
    expect((await request('/api/snapshot', token)).status).toBe(200)
    expect((await request('/api/snapshot', token, 'GET', 'https://evil.example')).status).toBe(403)
  })
  it('has no writes, arbitrary blob lookup, SQL or outside-scope details', async () => {
    const { request, token, reader, original } = await setup()
    expect((await request('/api/detail/demo%3A0', token, 'POST')).status).toBe(405)
    expect((await request('/api/detail/private-conversation', token)).status).toBe(404)
    expect((await request('/api/thumbnail/arbitrary-cid', token)).status).toBe(404)
    expect((await request('/sql', token)).status).toBe(404)
    expect(reader.detail).not.toHaveBeenCalled()
    expect(reader.thumbnail).not.toHaveBeenCalled()
    expect(JSON.stringify(reader.snapshot)).toBe(original)
  })
  it('supports scoped snapshot, search, detail and image reads', async () => {
    const { request, token } = await setup()
    for (const path of [
      '/api/snapshot',
      '/api/search?q=resource',
      '/api/detail/demo%3A0',
      '/api/thumbnail/demo%3A0'
    ]) {
      const response = await request(path, token)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    }
  })
  it('revokes in-flight reads as well as subsequent requests', async () => {
    const { bridge, reader, request, token } = await setup()
    let finish: (value: null) => void = () => undefined
    reader.detail.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const pending = request('/api/detail/demo%3A0', token)
    bridge.revoke()
    finish(null)
    expect((await pending).status).toBe(401)
    expect((await request('/api/snapshot', token)).status).toBe(401)
  })
  it('expires the reader and surfaces storage errors without plausible empty data', async () => {
    const { time, request, token, reader } = await setup()
    reader.detail.mockRejectedValue(new Error('database unavailable'))
    expect((await request('/api/detail/demo%3A0', token)).status).toBe(503)
    time(60 * 60_000)
    expect((await request('/api/snapshot', token)).status).toBe(401)
  })
})
