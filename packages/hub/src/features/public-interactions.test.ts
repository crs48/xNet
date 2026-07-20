/**
 * Public-interaction policy resolution (explorations 0378/0383 W2).
 *
 * The read half of the interaction layer: schema defaults when no policy node
 * exists, the author's explicit modes when one does (found O(1) at the
 * deterministic `publicInteractionPolicyId`), and the same NOT_PUBLIC 404 as
 * the public read surface for anything not effectively public.
 */
import { publicInteractionPolicyId } from '@xnetjs/data'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mountFeatures } from './registry'
import { publicInteractionsFeature } from './public-interactions'
import { createMemoryStorage } from '../storage/memory'

const passthroughAuth = async (_c: unknown, next: () => Promise<void>): Promise<void> => next()

const boot = async (storage: ReturnType<typeof createMemoryStorage>): Promise<Hono> => {
  const app = new Hono()
  await mountFeatures([publicInteractionsFeature(storage)], {
    app,
    env: {},
    requireAuth: passthroughAuth as never,
    storage: 'memory',
    dataDir: '/tmp/xnet-pi-test',
    appUrl: 'http://localhost'
  })
  return app
}

const seedNode = async (
  storage: ReturnType<typeof createMemoryStorage>,
  id: string
): Promise<void> => {
  const now = Date.now()
  await storage.setDocMeta(id, {
    docId: id,
    ownerDid: 'did:key:owner',
    schemaIri: 'xnet://xnet.fyi/Page@1.0.0',
    title: id,
    properties: { title: id },
    createdAt: now,
    updatedAt: now
  })
}

describe('public interactions feature (0378/0383 W2)', () => {
  it('resolves schema defaults for a public node with no policy', async () => {
    const storage = createMemoryStorage()
    await seedNode(storage, 'post')
    await storage.setNodeVisibility('post', 'public')
    const app = await boot(storage)

    const res = await app.request('/public/interactions/post')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      explicit: boolean
      visibility: string
      modes: Record<string, string>
    }
    expect(body.explicit).toBe(false)
    expect(body.visibility).toBe('public')
    // The schema's own defaults, not values invented here.
    expect(body.modes.commentMode).toBe('authenticated')
    expect(body.modes.reactionMode).toBe('authenticated')
    expect(body.modes.quoteMode).toBe('trusted')
    expect(body.modes.crawlMode).toBe('closed')
  })

  it("honours the author's explicit policy node at the deterministic id", async () => {
    const storage = createMemoryStorage()
    await seedNode(storage, 'post')
    await storage.setNodeVisibility('post', 'public')
    const now = Date.now()
    await storage.setDocMeta(publicInteractionPolicyId('post'), {
      docId: publicInteractionPolicyId('post'),
      ownerDid: 'did:key:owner',
      schemaIri: 'xnet://xnet.fyi/PublicInteractionPolicy@1.0.0',
      title: '',
      properties: { target: 'post', scope: 'node', commentMode: 'closed', reactionMode: 'open' },
      createdAt: now,
      updatedAt: now
    })
    const app = await boot(storage)

    const body = (await (await app.request('/public/interactions/post')).json()) as {
      explicit: boolean
      modes: Record<string, string>
    }
    expect(body.explicit).toBe(true)
    expect(body.modes.commentMode).toBe('closed')
    expect(body.modes.reactionMode).toBe('open')
    // Surfaces the policy did not set keep the schema default.
    expect(body.modes.quoteMode).toBe('trusted')
  })

  it('404s NOT_PUBLIC for private and unknown nodes, like the public read surface', async () => {
    const storage = createMemoryStorage()
    await seedNode(storage, 'secret')
    await storage.setNodeVisibility('secret', 'private')
    const app = await boot(storage)

    expect((await app.request('/public/interactions/secret')).status).toBe(404)
    expect((await app.request('/public/interactions/nope')).status).toBe(404)
  })
})
