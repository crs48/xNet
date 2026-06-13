/**
 * @xnetjs/hub - Public read routes (exploration 0179).
 *
 * The top of the private→public dial: unauthenticated, read-only access to
 * nodes whose effective visibility is `public`. A node is public when its own
 * visibility is `public`, or when it inherits (`inherit`/unset) and the nearest
 * ancestor Space with a definitive visibility is `public`. Private/unlisted
 * never leak here. GET has no side effects, so link scanners are harmless.
 *
 * This is the deliberate escalation the exploration gates behind the moderation
 * stack before GA; it returns only what the hub already holds (indexed DocMeta
 * + the Yjs document state), never bypassing the per-node grant model for
 * anything that is not explicitly public.
 */

import type { HubStorage } from '../storage/interface'
import { Hono } from 'hono'

export type PublicRouteDeps = {
  storage: HubStorage
  /** Max contained nodes returned for a public Space listing. */
  maxSpaceNodes?: number
}

/**
 * Resolve a node's effective visibility, honoring `inherit` up the Space chain.
 * Returns the first definitive (`public`/`private`/`unlisted`) value found on
 * the node or its nearest ancestor; defaults to `private`.
 */
export const resolveEffectiveVisibility = async (
  storage: HubStorage,
  nodeId: string
): Promise<'public' | 'unlisted' | 'private'> => {
  const definitive = (v: string | null): v is 'public' | 'unlisted' | 'private' =>
    v === 'public' || v === 'unlisted' || v === 'private'
  const own = await storage.getNodeVisibility(nodeId)
  if (definitive(own)) return own
  for (const ancestorId of await storage.ancestorContainers(nodeId)) {
    const v = await storage.getNodeVisibility(ancestorId)
    if (definitive(v)) return v
  }
  return 'private'
}

const isPublic = async (storage: HubStorage, nodeId: string): Promise<boolean> =>
  (await resolveEffectiveVisibility(storage, nodeId)) === 'public'

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

export const createPublicRoutes = (deps: PublicRouteDeps): Hono => {
  const { storage } = deps
  const maxSpaceNodes = deps.maxSpaceNodes ?? 500
  const app = new Hono()

  const serializeNode = async (
    nodeId: string
  ): Promise<{
    id: string
    schemaIri: string | null
    title: string | null
    properties: Record<string, unknown> | null
    docStateB64: string | null
  }> => {
    const meta = await storage.getDocMeta(nodeId)
    const state = await storage.getDocState(nodeId)
    return {
      id: nodeId,
      schemaIri: meta?.schemaIri ?? null,
      title: meta?.title ?? null,
      properties: meta?.properties ?? null,
      docStateB64: state ? toBase64(state) : null
    }
  }

  app.get('/node/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await isPublic(storage, id))) {
      return c.json({ code: 'NOT_PUBLIC', error: 'Node is not public' }, 404)
    }
    return c.json({ node: await serializeNode(id) })
  })

  app.get('/space/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await isPublic(storage, id))) {
      return c.json({ code: 'NOT_PUBLIC', error: 'Space is not public' }, 404)
    }
    // Breadth-first over the containment tree, returning only public nodes.
    const seen = new Set<string>([id])
    const queue = [id]
    const publicNodeIds: string[] = []
    while (queue.length > 0 && publicNodeIds.length < maxSpaceNodes) {
      const current = queue.shift() as string
      for (const child of await storage.listContainedNodes(current)) {
        if (seen.has(child)) continue
        seen.add(child)
        queue.push(child)
        if (await isPublic(storage, child)) publicNodeIds.push(child)
      }
    }
    const nodes = await Promise.all(publicNodeIds.map(serializeNode))
    return c.json({
      space: await serializeNode(id),
      nodes,
      truncated: publicNodeIds.length >= maxSpaceNodes
    })
  })

  return app
}
