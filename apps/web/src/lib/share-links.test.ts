/**
 * Share-link client logic (exploration 0169): URL parsing, claim calls,
 * destination decisions, and the /share route input forms.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimErrorText,
  claimShareLink,
  decideClaimDestination,
  docRouteFor,
  hubApiFetch,
  isPrivateHubHost,
  normalizeHubHttpUrl,
  normalizeHubWsUrl,
  parseShareRouteInput,
  parseShareUrl,
  ShareClaimError,
  shareClaimErrorMessage
} from './share-links'

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseShareUrl', () => {
  it('parses canonical https share URLs with fragment secrets', () => {
    expect(parseShareUrl('https://hub.xnet.fyi/s/AbCdEf123#s=c2VjcmV0')).toEqual({
      linkId: 'AbCdEf123',
      hub: 'https://hub.xnet.fyi',
      secret: 'c2VjcmV0'
    })
  })

  it('parses xnet:// deep-link form and normalizes ws hubs', () => {
    expect(
      parseShareUrl('xnet://share?link=AbCdEf123&hub=wss%3A%2F%2Fhub.xnet.fyi#s=c2VjcmV0')
    ).toEqual({
      linkId: 'AbCdEf123',
      hub: 'https://hub.xnet.fyi',
      secret: 'c2VjcmV0'
    })
  })

  it('rejects URLs without secrets, bad link ids, and other schemes', () => {
    expect(parseShareUrl('https://hub.xnet.fyi/s/AbCdEf123')).toBeNull()
    expect(parseShareUrl('https://hub.xnet.fyi/other/AbCdEf123#s=x')).toBeNull()
    expect(parseShareUrl('xnet://share?link=ab&hub=https://h#s=x')).toBeNull()
    expect(parseShareUrl('xnet://open?link=AbCdEf123&hub=https://h#s=x')).toBeNull()
    expect(parseShareUrl('ftp://hub/s/AbCdEf123#s=x')).toBeNull()
    expect(parseShareUrl('not a url')).toBeNull()
    expect(parseShareUrl('')).toBeNull()
  })
})

describe('claimShareLink', () => {
  const input = { linkId: 'AbCdEf123', hub: 'wss://hub.example.com', secret: 'shh' }

  it('claims against the hub http endpoint and returns the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        resource: 'doc-1',
        docType: 'page',
        role: 'read',
        endpoint: 'wss://hub.example.com'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await claimShareLink(input, 'token-abc')
    expect(result.resource).toBe('doc-1')
    expect(result.role).toBe('read')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hub.example.com/shares/links/AbCdEf123/claim')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
    expect(JSON.parse(init.body as string)).toEqual({ secret: 'shh' })
  })

  it('throws a coded ShareClaimError on hub rejections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(410, { code: 'LINK_REVOKED', error: 'disabled' }))
    )
    await expect(claimShareLink(input, 'token')).rejects.toMatchObject({
      name: 'ShareClaimError',
      code: 'LINK_REVOKED'
    })
  })

  it('falls back to an HTTP_<status> code on malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })))
    await expect(claimShareLink(input, 'token')).rejects.toMatchObject({ code: 'HTTP_502' })
  })

  it('maps a network-layer failure to HUB_UNREACHABLE naming the hub (0290)', async () => {
    // fetch() rejects with a bare TypeError for hub-down / CORS-less edge
    // errors — the user should see an outage, not "Failed to fetch".
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(claimShareLink(input, 'token')).rejects.toMatchObject({
      name: 'ShareClaimError',
      code: 'HUB_UNREACHABLE',
      message: expect.stringContaining('https://hub.example.com')
    })
  })
})

describe('claim error text', () => {
  it('maps every known code to guidance and unknown codes to a default', () => {
    for (const code of [
      'LINK_REVOKED',
      'LINK_EXPIRED',
      'LINK_EXHAUSTED',
      'LINK_NOT_FOUND',
      'BAD_SECRET',
      'RATE_LIMITED'
    ]) {
      expect(shareClaimErrorMessage(code)).not.toBe(shareClaimErrorMessage('SOMETHING_ELSE'))
    }
  })

  it('renders claim errors, plain errors, and non-errors', () => {
    expect(claimErrorText(new ShareClaimError('LINK_EXPIRED', 'x'))).toBe(
      shareClaimErrorMessage('LINK_EXPIRED')
    )
    expect(claimErrorText(new Error('boom'))).toBe('boom')
    expect(claimErrorText('weird')).toBe('weird')
  })
})

describe('docRouteFor', () => {
  it('routes every shareable doc type', () => {
    expect(docRouteFor('page', 'a')).toEqual({ to: '/doc/$docId', params: { docId: 'a' } })
    expect(docRouteFor('database', 'b')).toEqual({ to: '/db/$dbId', params: { dbId: 'b' } })
    expect(docRouteFor('canvas', 'c')).toEqual({
      to: '/canvas/$canvasId',
      params: { canvasId: 'c' }
    })
    expect(docRouteFor('dashboard', 'd')).toEqual({
      to: '/dashboard/$dashboardId',
      params: { dashboardId: 'd' }
    })
    expect(docRouteFor('view', 'e')).toEqual({ to: '/view/$viewId', params: { viewId: 'e' } })
    expect(docRouteFor('space', 'f')).toEqual({ to: '/space/$spaceId', params: { spaceId: 'f' } })
    // Workspaces have no viewer route — a claimed bench lands home (0280/0290).
    expect(docRouteFor('workspace', 'g')).toEqual({ to: '/', params: {} })
  })
})

describe('decideClaimDestination', () => {
  it('navigates in-SPA when the link hub matches the connected hub', () => {
    expect(decideClaimDestination('wss://hub.x', 'https://hub.x', 'wss://hub.x')).toEqual({
      kind: 'navigate'
    })
    expect(decideClaimDestination('', 'https://hub.x', 'wss://hub.x')).toEqual({
      kind: 'navigate'
    })
  })

  it('switches hubs when they differ or none is connected', () => {
    expect(decideClaimDestination('wss://other.x', 'https://other.x', 'wss://hub.x')).toEqual({
      kind: 'switch-hub',
      endpoint: 'wss://other.x'
    })
    expect(decideClaimDestination('wss://hub.x', 'https://hub.x', null)).toEqual({
      kind: 'switch-hub',
      endpoint: 'wss://hub.x'
    })
  })
})

describe('parseShareRouteInput', () => {
  const at = (href: string): { hash: string; href: string } => ({
    hash: new URL(href).hash,
    href
  })

  it('reads link inputs from hash-routed URLs (secret inside hash query)', () => {
    expect(
      parseShareRouteInput(
        at('https://xnet.fyi/app/#/share?link=AbCdEf123&hub=https%3A%2F%2Fhub.x&s=shh')
      )
    ).toEqual({
      kind: 'link',
      value: { linkId: 'AbCdEf123', hub: 'https://hub.x', secret: 'shh' }
    })
  })

  it('reads link inputs from path-routed URLs (secret in #s= fragment)', () => {
    expect(
      parseShareRouteInput(
        at('http://localhost:5173/share?link=AbCdEf123&hub=wss%3A%2F%2Fhub.x#s=shh')
      )
    ).toEqual({
      kind: 'link',
      value: { linkId: 'AbCdEf123', hub: 'https://hub.x', secret: 'shh' }
    })
  })

  it('treats malformed link inputs as missing', () => {
    expect(parseShareRouteInput(at('http://localhost/share?link=short&hub=h#s=x')).kind).toBe(
      'missing'
    )
    expect(parseShareRouteInput(at('http://localhost/share?link=AbCdEf123&hub=h')).kind).toBe(
      'missing'
    )
  })

  it('falls through to handle, payload, then missing', () => {
    expect(parseShareRouteInput(at('http://localhost/share?handle=sh_abc'))).toEqual({
      kind: 'handle',
      value: 'sh_abc'
    })
    expect(parseShareRouteInput(at('https://xnet.fyi/app/#/share?payload=AbC123'))).toEqual({
      kind: 'payload',
      value: 'AbC123'
    })
    expect(parseShareRouteInput(at('http://localhost/share'))).toEqual({
      kind: 'missing',
      value: ''
    })
  })
})

describe('hubApiFetch', () => {
  it('sends authenticated JSON requests and returns parsed bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { links: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const data = await hubApiFetch('https://hub.x', 'tok', '/shares/links?docId=d', {
      method: 'POST',
      body: { docId: 'd' }
    })
    expect(data).toEqual({ links: [] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hub.x/shares/links?docId=d')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('throws with the hub error text on failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'not allowed' })))
    await expect(hubApiFetch('https://hub.x', 'tok', '/shares/links')).rejects.toThrow(
      'not allowed'
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 500 })))
    await expect(hubApiFetch('https://hub.x', 'tok', '/x')).rejects.toThrow(
      'Hub request failed (500)'
    )
  })

  it('names the hub on network-layer failures instead of "Failed to fetch" (0290)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(hubApiFetch('https://hub.x', 'tok', '/shares/links')).rejects.toThrow(
      "Your hub (https://hub.x) isn't responding"
    )
  })
})

describe('isPrivateHubHost and URL normalization', () => {
  it('flags loopback, RFC-1918, and .local hosts', () => {
    for (const host of [
      'http://localhost:4444',
      'wss://127.0.0.1',
      'https://10.1.2.3',
      'https://192.168.0.9',
      'https://172.16.5.5',
      'https://hub.local'
    ]) {
      expect(isPrivateHubHost(host)).toBe(true)
    }
  })

  it('accepts public hosts and tolerates garbage', () => {
    expect(isPrivateHubHost('https://hub.xnet.fyi')).toBe(false)
    expect(isPrivateHubHost('https://172.32.0.1')).toBe(false)
    expect(isPrivateHubHost('::::')).toBe(false)
  })

  it('normalizes between ws and http forms', () => {
    expect(normalizeHubHttpUrl('wss://hub.x/')).toBe('https://hub.x')
    expect(normalizeHubHttpUrl('ws://localhost:4444')).toBe('http://localhost:4444')
    expect(normalizeHubWsUrl('https://hub.x/')).toBe('wss://hub.x')
    expect(normalizeHubWsUrl('http://localhost:4444')).toBe('ws://localhost:4444')
  })
})
