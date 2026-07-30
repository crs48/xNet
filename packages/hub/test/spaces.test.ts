/**
 * Space container grants (exploration 0179): a membership is a grant keyed on a
 * Space id; the hub resolves it for every node beneath that Space via the
 * node→container index. Covers containment, nested inheritance, the expansive
 * union rule, per-doc removal precedence, member listing, storage round-trip,
 * and the share-link `docType: 'space'` claim.
 */

import type { GrantIndexRecord } from '../src/storage/interface'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUCAN, generateKeyBundle, type KeyBundle } from '@xnetjs/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub, type HubInstance } from '../src'
import { createPublicRoutes, resolveEffectiveVisibility } from '../src/routes/public'
import { ShareAccessService } from '../src/services/share-access'
import { createMemoryStorage } from '../src/storage/memory'
import { createSQLiteStorage } from '../src/storage/sqlite'
import { syncSpaceAs } from './helpers/space-sync'

const TASK_SCHEMA = 'xnet://xnet.fyi/Task@1.0.0'
const COMMENT_SCHEMA = 'xnet://xnet.fyi/Comment@1.0.0'

let seq = 0
const grant = (granteeDid: string, resource: string, actions: string[]): GrantIndexRecord => ({
  grantId: `g-${++seq}`,
  granteeDid,
  resourceDocId: resource,
  actions,
  expiresAt: 0,
  revokedAt: 0,
  createdAt: Date.now() + seq
})

describe('space container-grant resolution', () => {
  it('lets a space member access and write nodes filed in the space', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeA', 'space1')
    await storage.upsertGrantIndex(grant('did:key:bob', 'space1', ['read', 'comment', 'write']))

    expect(await svc.getStatusForNode('did:key:bob', 'nodeA')).toBe('write')
    expect(await svc.canAccessNode('did:key:bob', 'nodeA')).toBe(true)
    expect(await svc.canWriteNodeChange('did:key:bob', 'nodeA', TASK_SCHEMA)).toBe(true)
    expect(await svc.canWriteYjs('did:key:bob', 'nodeA')).toBe(true)
  })

  it('enforces a viewer role from a space grant (read, no write)', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeA', 'space1')
    await storage.upsertGrantIndex(grant('did:key:carol', 'space1', ['read']))

    expect(await svc.getStatusForNode('did:key:carol', 'nodeA')).toBe('read')
    expect(await svc.canAccessNode('did:key:carol', 'nodeA')).toBe(true)
    expect(await svc.canWriteNodeChange('did:key:carol', 'nodeA', TASK_SCHEMA)).toBe(false)
    expect(await svc.canWriteYjs('did:key:carol', 'nodeA')).toBe(false)
  })

  it('lets a commenter write only comment-kind schemas', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeA', 'space1')
    await storage.upsertGrantIndex(grant('did:key:cm', 'space1', ['read', 'comment']))

    expect(await svc.canWriteNodeChange('did:key:cm', 'nodeA', COMMENT_SCHEMA)).toBe(true)
    expect(await svc.canWriteNodeChange('did:key:cm', 'nodeA', TASK_SCHEMA)).toBe(false)
    expect(await svc.canWriteYjs('did:key:cm', 'nodeA')).toBe(false)
  })

  it('inherits access down a nested space chain (org → team → project → node)', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeB', 'project1')
    await storage.setNodeContainer('project1', 'team1')
    await storage.setNodeContainer('team1', 'org1')
    await storage.upsertGrantIndex(
      grant('did:key:dave', 'org1', ['read', 'comment', 'write', 'admin'])
    )

    expect(await svc.getStatusForNode('did:key:dave', 'nodeB')).toBe('write')
    expect(await svc.canAccessNode('did:key:dave', 'nodeB')).toBe(true)
    // A member of a sibling team has no access.
    await storage.upsertGrantIndex(grant('did:key:eve', 'team2', ['read', 'comment', 'write']))
    expect(await svc.getStatusForNode('did:key:eve', 'nodeB')).toBe('none')
    expect(await svc.canAccessNode('did:key:eve', 'nodeB')).toBe(false)
  })

  it('takes the most permissive of direct and space grants (expansive rule)', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeA', 'space1')
    await storage.upsertGrantIndex(grant('did:key:frank', 'nodeA', ['read'])) // direct viewer
    await storage.upsertGrantIndex(grant('did:key:frank', 'space1', ['read', 'comment', 'write']))

    expect(await svc.getStatusForNode('did:key:frank', 'nodeA')).toBe('write')
  })

  it('an explicit per-doc removal denies even a space member (deny wins)', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeA', 'space1')
    await storage.upsertGrantIndex(grant('did:key:grace', 'space1', ['read', 'comment', 'write']))
    const direct = grant('did:key:grace', 'nodeA', ['read', 'comment', 'write'])
    await storage.upsertGrantIndex(direct)
    await storage.revokeGrant(direct.grantId)

    expect(await svc.getStatusForNode('did:key:grace', 'nodeA')).toBe('revoked')
    expect(await svc.canAccessNode('did:key:grace', 'nodeA')).toBe(false)
    expect(await svc.canWriteNodeChange('did:key:grace', 'nodeA', TASK_SCHEMA)).toBe(false)
  })

  it('removing a member (revoking the space grant) drops their access', async () => {
    const storage = createMemoryStorage()
    const svc = new ShareAccessService(storage, 0)
    await storage.setNodeContainer('nodeA', 'space1')
    const g = grant('did:key:heidi', 'space1', ['read', 'comment', 'write'])
    await storage.upsertGrantIndex(g)
    expect(await svc.canAccessNode('did:key:heidi', 'nodeA')).toBe(true)

    await storage.revokeGrant(g.grantId)
    expect(await svc.getStatusForNode('did:key:heidi', 'nodeA')).toBe('none')
    expect(await svc.canAccessNode('did:key:heidi', 'nodeA')).toBe(false)
  })

  it('lists space members via listGrantsForDoc on the space id', async () => {
    const storage = createMemoryStorage()
    await storage.upsertGrantIndex(grant('did:key:ann', 'space1', ['read']))
    await storage.upsertGrantIndex(grant('did:key:bob', 'space1', ['read', 'comment', 'write']))
    const members = await storage.listGrantsForDoc('space1')
    expect(members.map((m) => m.granteeDid).sort()).toEqual(['did:key:ann', 'did:key:bob'])
  })
})

describe('containment index storage', () => {
  it('resolves ancestors and is cycle-safe (memory)', async () => {
    const storage = createMemoryStorage()
    await storage.setNodeContainer('node', 'a')
    await storage.setNodeContainer('a', 'b')
    await storage.setNodeContainer('b', 'a') // cycle
    const ancestors = await storage.ancestorContainers('node')
    expect(ancestors).toEqual(['a', 'b'])
    expect(await storage.getNodeContainer('node')).toBe('a')
  })

  it('clears a container when set to null', async () => {
    const storage = createMemoryStorage()
    await storage.setNodeContainer('node', 'a')
    await storage.setNodeContainer('node', null)
    expect(await storage.getNodeContainer('node')).toBeNull()
    expect(await storage.ancestorContainers('node')).toEqual([])
  })

  it('persists containment across a sqlite restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-space-'))
    try {
      const storage = createSQLiteStorage(dir)
      await storage.setNodeContainer('node', 'project')
      await storage.setNodeContainer('project', 'org')
      await storage.close()

      const reopened = createSQLiteStorage(dir)
      expect(await reopened.ancestorContainers('node')).toEqual(['project', 'org'])
      await reopened.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('public visibility (the private→public dial)', () => {
  const setMeta = async (
    storage: ReturnType<typeof createMemoryStorage>,
    id: string,
    title: string
  ): Promise<void> => {
    const now = Date.now()
    await storage.setDocMeta(id, {
      docId: id,
      ownerDid: 'did:key:owner',
      schemaIri: 'xnet://xnet.fyi/Page@1.0.0',
      title,
      properties: { title },
      createdAt: now,
      updatedAt: now
    })
  }

  it('resolves inherited visibility up the space chain', async () => {
    const storage = createMemoryStorage()
    await storage.setNodeContainer('page', 'space')
    await storage.setNodeVisibility('space', 'public')
    // page inherits (unset) → resolves to the space's public
    expect(await resolveEffectiveVisibility(storage, 'page')).toBe('public')
    // explicit private on the page wins (no lowering past it)
    await storage.setNodeVisibility('page', 'private')
    expect(await resolveEffectiveVisibility(storage, 'page')).toBe('private')
    // unknown node defaults to private
    expect(await resolveEffectiveVisibility(storage, 'orphan')).toBe('private')
  })

  it('serves a public node and 404s a private one', async () => {
    const storage = createMemoryStorage()
    const app = createPublicRoutes({ storage })
    await setMeta(storage, 'pub', 'Public page')
    await storage.setNodeVisibility('pub', 'public')
    await setMeta(storage, 'priv', 'Private page')
    await storage.setNodeVisibility('priv', 'private')

    const okRes = await app.request('/node/pub')
    expect(okRes.status).toBe(200)
    const okBody = (await okRes.json()) as { node: { id: string; title: string } }
    expect(okBody.node.id).toBe('pub')
    expect(okBody.node.title).toBe('Public page')

    const denied = await app.request('/node/priv')
    expect(denied.status).toBe(404)
  })

  it('lists only public nodes within a public space (transitive)', async () => {
    const storage = createMemoryStorage()
    const app = createPublicRoutes({ storage })
    await storage.setNodeVisibility('space', 'public')
    await setMeta(storage, 'space', 'Open space')
    // child1 public (explicit), child2 private, grandchild inherits public via space? no — under child2
    await storage.setNodeContainer('child1', 'space')
    await storage.setNodeVisibility('child1', 'public')
    await setMeta(storage, 'child1', 'Child 1')
    await storage.setNodeContainer('child2', 'space')
    await storage.setNodeVisibility('child2', 'private')
    await setMeta(storage, 'child2', 'Child 2')
    // grandchild under child1 inherits → public
    await storage.setNodeContainer('grand', 'child1')
    await setMeta(storage, 'grand', 'Grandchild')

    const res = await app.request('/space/space')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: Array<{ id: string }> }
    const ids = body.nodes.map((n) => n.id).sort()
    expect(ids).toEqual(['child1', 'grand'])
  })
})

// ─── Full-hub: claim a space invite link ──────────────────────────────────────

const PORT = 14497
const BASE = `http://localhost:${PORT}`

type Actor = { bundle: KeyBundle; did: string; token: string }
const makeActor = (): Actor => {
  const bundle = generateKeyBundle()
  const token = createUCAN({
    issuer: bundle.identity.did,
    issuerKey: bundle.signingKey,
    audience: 'did:key:hub',
    capabilities: [{ with: '*', can: '*' }]
  })
  return { bundle, did: bundle.identity.did, token }
}

const api = async (
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status, json }
}

describe('space invite links', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, storage: 'memory', publicUrl: `ws://localhost:${PORT}` })
    await hub.start()
  })
  afterAll(async () => {
    await hub.stop()
  })

  it('accepts docType "space" and a claim writes a container grant on the space', async () => {
    const owner = makeActor()
    const member = makeActor()
    const spaceId = 'space:acme-eng'

    // Sync the Space first so the hub has an attested owner: a Space grant is
    // a container grant, so minting a link for a Space with no recorded owner
    // is refused (see space-share-ownership.test.ts).
    await syncSpaceAs(PORT, owner, spaceId)

    const created = await api('/shares/links', {
      method: 'POST',
      token: owner.token,
      body: { docId: spaceId, docType: 'space', role: 'write', label: 'Eng team' }
    })
    expect(created.status).toBe(200)
    const url = created.json.url as string
    const secret = url.split('#s=')[1]
    const linkId = created.json.linkId as string

    const claimed = await api(`/shares/links/${linkId}/claim`, {
      method: 'POST',
      token: member.token,
      body: { secret }
    })
    expect(claimed.status).toBe(200)
    expect(claimed.json.resource).toBe(spaceId)
    expect(claimed.json.docType).toBe('space')

    // The claim wrote a container grant on the space id (the members list).
    const grants = await api(`/shares/grants?docId=${encodeURIComponent(spaceId)}`, {
      token: owner.token
    })
    expect(grants.status).toBe(200)
    const list = grants.json.grants as Array<{ granteeDid: string; actions: string[] }>
    const memberGrant = list.find((g) => g.granteeDid === member.did)
    expect(memberGrant?.actions).toContain('write')
  })
})
