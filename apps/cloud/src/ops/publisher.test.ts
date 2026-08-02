import type { AuditEntry } from './audit'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPS_SPACE,
  opsHubPublisher,
  opsHubPublisherFromEnv,
  toAuditNode
} from './publisher'

const entry: AuditEntry = {
  entryId: '0000000000000001-000001',
  atMs: 1,
  operator: 'user_ops',
  operatorDid: 'did:key:zOps',
  action: 'tenant.recover',
  tenantId: 't_a',
  reason: 'lost passkey',
  outcome: 'started'
}

describe('toAuditNode', () => {
  it('carries operator, action, tenant, reason and outcome — and nothing else', () => {
    const node = toAuditNode(entry)
    expect(node.nodeType).toBe('ops-audit-entry')
    expect(node.spaceId).toBe(DEFAULT_OPS_SPACE)
    expect(Object.keys(node.properties).sort()).toEqual([
      'action',
      'atMs',
      'entryId',
      'operator',
      'operatorDid',
      'outcome',
      'reason',
      'tenantId'
    ])
  })

  it('omits optional fields rather than emitting undefined', () => {
    const node = toAuditNode({ ...entry, operatorDid: undefined, reason: undefined })
    expect('operatorDid' in node.properties).toBe(false)
    expect('reason' in node.properties).toBe(false)
  })
})

describe('opsHubPublisher', () => {
  it('POSTs the node with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }))
    await opsHubPublisher({
      hubUrl: 'https://ops.hub/',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    }).publish(entry)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ops.hub/nodes')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  // A silently-swallowed rejection would make an unreachable hub look identical
  // to a healthy one — the caller must see the failure so the entry stays queued.
  it('throws on a non-2xx so the entry stays queued', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }))
    await expect(
      opsHubPublisher({
        hubUrl: 'https://ops.hub',
        token: 'tok',
        fetchImpl: fetchImpl as unknown as typeof fetch
      }).publish(entry)
    ).rejects.toThrow(/503/)
  })
})

describe('opsHubPublisherFromEnv', () => {
  it('returns null when the ops hub is not configured', () => {
    expect(opsHubPublisherFromEnv({})).toBeNull()
    expect(opsHubPublisherFromEnv({ XNET_OPS_HUB_URL: 'https://x' })).toBeNull()
    expect(opsHubPublisherFromEnv({ XNET_OPS_HUB_TOKEN: 't' })).toBeNull()
  })

  it('builds a publisher when both url and token are present', () => {
    expect(
      opsHubPublisherFromEnv({ XNET_OPS_HUB_URL: 'https://x', XNET_OPS_HUB_TOKEN: 't' })
    ).not.toBeNull()
  })
})
