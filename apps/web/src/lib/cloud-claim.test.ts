import { describe, expect, it, vi } from 'vitest'
import { pollDeviceClaim, startDeviceClaim } from './cloud-claim'

const CHALLENGE = { did: 'did:key:alice', nonce: 'n', signature: 's' }

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('cloud-claim client', () => {
  it('starts a device claim and returns the codes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        deviceCode: 'dc',
        userCode: 'ABCD-7K2P',
        verificationUri: 'https://cloud.xnet.fyi/claim',
        intervalSec: 2,
        expiresInSec: 600
      })
    )
    const start = await startDeviceClaim('https://cloud.xnet.fyi', 'did:key:alice', fetchImpl)
    expect(start.userCode).toBe('ABCD-7K2P')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cloud.xnet.fyi/device/start',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('reports pending until approval, then complete with the hub URL', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'complete', hubUrl: 'wss://t.hub.xnet.fyi' }))

    const first = await pollDeviceClaim('https://cloud.xnet.fyi', 'dc', CHALLENGE, fetchImpl)
    expect(first).toEqual({ status: 'pending' })

    const second = await pollDeviceClaim('https://cloud.xnet.fyi', 'dc', CHALLENGE, fetchImpl)
    expect(second).toEqual({ status: 'complete', hubUrl: 'wss://t.hub.xnet.fyi' })
  })

  it('surfaces a control-plane error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'did_mismatch' }, { status: 400 }))
    const res = await pollDeviceClaim('https://cloud.xnet.fyi', 'dc', CHALLENGE, fetchImpl)
    expect(res).toEqual({ status: 'error', error: 'did_mismatch' })
  })
})
