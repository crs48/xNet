import { describe, expect, it } from 'vitest'
import {
  createFrameAwareDeliver,
  createIntegrationApply,
  EXTERNAL_ITEM_SCHEMA,
  type WebhookNodeWriter
} from './webhook-deliver'

function collectingWriter() {
  const created: Array<{ schemaId: string; properties: Record<string, unknown> }> = []
  const writer: WebhookNodeWriter = {
    create: async (options) => {
      created.push(options)
      return { id: `node-${created.length}` }
    }
  }
  return { writer, created }
}

describe('createFrameAwareDeliver (0346 — closing the 0213 seam)', () => {
  it('materializes a delivery as a space-stamped ExternalItem with a frame target', async () => {
    const { writer, created } = collectingWriter()
    const deliver = createFrameAwareDeliver({
      writer,
      frameTargetPage: 'page-team',
      nowMs: () => 1_000
    })

    await deliver({
      token: 'tok_1',
      route: { space: 'space-1', label: 'zapier' },
      payload: { title: 'Deploy finished', status: 'ok' }
    })

    expect(created).toHaveLength(1)
    expect(created[0].schemaId).toBe(EXTERNAL_ITEM_SCHEMA)
    expect(created[0].properties).toMatchObject({
      space: 'space-1',
      source: 'webhook',
      kind: 'zapier',
      title: 'Deploy finished',
      frameTarget: 'page-team',
      receivedAt: 1_000
    })
  })

  it('caps hostile payloads instead of bloating the node log', async () => {
    const { writer, created } = collectingWriter()
    const deliver = createFrameAwareDeliver({ writer, nowMs: () => 0 })
    await deliver({
      token: 't',
      route: { space: 's' },
      payload: { blob: 'x'.repeat(50_000) }
    })
    expect(String(created[0].properties.payload).length).toBeLessThanOrEqual(16_385)
  })

  it('honors a route-specified schema override', async () => {
    const { writer, created } = collectingWriter()
    const deliver = createFrameAwareDeliver({ writer, nowMs: () => 0 })
    await deliver({
      token: 't',
      route: { space: 's', schema: 'xnet://xnet.fyi/FeedItem@1.0.0' },
      payload: {}
    })
    expect(created[0].schemaId).toBe('xnet://xnet.fyi/FeedItem@1.0.0')
  })
})

describe('createIntegrationApply', () => {
  it('materializes one ExternalItem per normalized action', async () => {
    const { writer, created } = collectingWriter()
    const apply = createIntegrationApply({
      writer,
      space: 'space-1',
      frameTargetPage: 'page-ops',
      nowMs: () => 42
    })

    await apply([
      {
        source: 'stripe',
        kind: 'payment_intent.succeeded',
        externalId: 'evt_1',
        title: 'Payment succeeded',
        url: 'https://dashboard.stripe.com/evt_1'
      },
      { source: 'sentry', kind: 'issue', externalId: 'iss_2', title: 'TypeError' }
    ])

    expect(created).toHaveLength(2)
    expect(created[0].properties).toMatchObject({
      source: 'stripe',
      externalId: 'evt_1',
      frameTarget: 'page-ops',
      space: 'space-1'
    })
    expect(created[1].properties).toMatchObject({ source: 'sentry', externalId: 'iss_2' })
  })
})
