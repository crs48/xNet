/**
 * Conformance tests for the Space authorization cascade (exploration 0181).
 *
 * Verifies that membership on a Space — modeled as SpaceMembership edges —
 * cascades down the `parent` chain and is inherited by content via the
 * `role.relation('space', …)` blocks, using the real shipped schemas and the
 * DefaultPolicyEvaluator (the same engine the P2P sync gate runs).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { beforeEach, describe, expect, it } from 'vitest'
import { SchemaRegistry } from '../schema/registry'
import { ChannelSchema } from '../schema/schemas/channel'
import { ChatMessageSchema } from '../schema/schemas/chat-message'
import { MilestoneSchema } from '../schema/schemas/milestone'
import { ProjectSchema } from '../schema/schemas/project'
import { SpaceSchema, SPACE_SCHEMA_IRI } from '../schema/schemas/space'
import {
  SpaceMembershipSchema,
  SPACE_MEMBERSHIP_SCHEMA_IRI,
  spaceMembershipId
} from '../schema/schemas/space-membership'
import { TaskSchema } from '../schema/schemas/task'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { DecisionCache, DefaultPolicyEvaluator } from './evaluator'
import { GrantIndex } from './grants'

function createIdentity(): { did: DID; privateKey: Uint8Array } {
  const keyPair = generateSigningKeyPair()
  return { did: createDID(keyPair.publicKey) as DID, privateKey: keyPair.privateKey }
}

async function createStore(author: { did: DID; privateKey: Uint8Array }): Promise<NodeStore> {
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: author.did,
    signingKey: author.privateKey
  })
  await store.initialize()
  return store
}

function registry(): SchemaRegistry {
  const r = new SchemaRegistry()
  r.register(SpaceSchema)
  r.register(SpaceMembershipSchema)
  r.register(ProjectSchema)
  r.register(TaskSchema)
  r.register(MilestoneSchema)
  r.register(ChannelSchema)
  r.register(ChatMessageSchema)
  return r
}

describe('Space authorization cascade', () => {
  // owner (creator of every node below) — a separate governance identity
  const owner = createIdentity()
  const aliceOrgAdmin = createIdentity() // admin @ Acme (org)
  const bobTeamMember = createIdentity() // member @ Eng (team)
  const carolTeamViewer = createIdentity() // viewer @ Eng
  const danDesignMember = createIdentity() // member @ Design (sibling team)
  const erinMixed = createIdentity() // viewer @ Eng AND admin @ Acme
  const stranger = createIdentity()

  let store: NodeStore
  let evaluator: DefaultPolicyEvaluator
  let grantIndex: GrantIndex
  let acme: string // org space
  let eng: string // team space (child of acme)
  let design: string // sibling team space (child of acme)
  let engProject: string
  let engTask: string

  async function addMember(space: string, member: DID, roleId: string): Promise<void> {
    await store.create({
      schemaId: SPACE_MEMBERSHIP_SCHEMA_IRI,
      id: spaceMembershipId(space, member),
      properties: { space, member, role: roleId, addedBy: owner.did, addedAt: 1 }
    })
  }

  beforeEach(async () => {
    store = await createStore(owner)

    const acmeNode = await store.create({
      schemaId: SPACE_SCHEMA_IRI,
      properties: { name: 'Acme', kind: 'organization', visibility: 'private' }
    })
    acme = acmeNode.id

    const engNode = await store.create({
      schemaId: SPACE_SCHEMA_IRI,
      properties: { name: 'Engineering', kind: 'team', parent: acme, visibility: 'private' }
    })
    eng = engNode.id

    const designNode = await store.create({
      schemaId: SPACE_SCHEMA_IRI,
      properties: { name: 'Design', kind: 'team', parent: acme, visibility: 'private' }
    })
    design = designNode.id

    const project = await store.create({
      schemaId: ProjectSchema.schema['@id'],
      properties: { name: 'Auth rewrite', status: 'in-progress', space: eng }
    })
    engProject = project.id

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: { title: 'Wire passkeys', status: 'todo', project: engProject, space: eng }
    })
    engTask = task.id

    await addMember(acme, aliceOrgAdmin.did, 'admin')
    await addMember(eng, bobTeamMember.did, 'member')
    await addMember(eng, carolTeamViewer.did, 'viewer')
    await addMember(design, danDesignMember.did, 'member')
    await addMember(eng, erinMixed.did, 'viewer')
    await addMember(acme, erinMixed.did, 'admin')

    grantIndex = new GrantIndex(store)
    await grantIndex.initialize()
    evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry: registry(),
      grantIndex,
      cache: new DecisionCache({ ttlMs: 60_000 })
    })
  })

  async function can(subject: DID, action: 'read' | 'write' | 'share', nodeId: string) {
    const d = await evaluator.can({ subject, action, nodeId })
    return d.allowed
  }

  it('cascades org-admin access down to nested team content', async () => {
    // Alice is admin @ Acme; Eng is a child of Acme; the task lives in Eng.
    expect(await can(aliceOrgAdmin.did, 'read', engTask)).toBe(true)
    expect(await can(aliceOrgAdmin.did, 'write', engTask)).toBe(true)
    expect(await can(aliceOrgAdmin.did, 'share', engTask)).toBe(true)
    // …and to the project, and to the team space node itself.
    expect(await can(aliceOrgAdmin.did, 'write', engProject)).toBe(true)
    expect(await can(aliceOrgAdmin.did, 'read', eng)).toBe(true)
  })

  it('grants team members write but not share', async () => {
    expect(await can(bobTeamMember.did, 'read', engTask)).toBe(true)
    expect(await can(bobTeamMember.did, 'write', engTask)).toBe(true)
    expect(await can(bobTeamMember.did, 'share', engTask)).toBe(false)
  })

  it('grants team viewers read but not write', async () => {
    expect(await can(carolTeamViewer.did, 'read', engTask)).toBe(true)
    expect(await can(carolTeamViewer.did, 'write', engTask)).toBe(false)
  })

  it('isolates sibling teams (Design member gets nothing in Eng)', async () => {
    expect(await can(danDesignMember.did, 'read', engTask)).toBe(false)
    expect(await can(danDesignMember.did, 'write', engTask)).toBe(false)
  })

  it('takes the most-permissive role across the nesting', async () => {
    // Erin is only a viewer on Eng, but admin on Acme — admin wins downward.
    expect(await can(erinMixed.did, 'read', engTask)).toBe(true)
    expect(await can(erinMixed.did, 'write', engTask)).toBe(true)
    expect(await can(erinMixed.did, 'share', engTask)).toBe(true)
  })

  it('denies a stranger and keeps the owner', async () => {
    expect(await can(stranger.did, 'read', engTask)).toBe(false)
    // The creator (governance identity) is always owner.
    expect(await can(owner.did, 'write', engTask)).toBe(true)
    expect(await can(owner.did, 'share', engTask)).toBe(true)
  })

  it('does not leak a child-team membership up to the parent org', async () => {
    // Bob is a member of Eng only; he must not gain access to a sibling space
    // or to the org node above his team.
    expect(await can(bobTeamMember.did, 'read', design)).toBe(false)
    expect(await can(bobTeamMember.did, 'read', acme)).toBe(false)
  })

  it('cascades to a milestone filed in the team space', async () => {
    const milestone = await store.create({
      schemaId: MilestoneSchema.schema['@id'],
      properties: { name: 'Beta', status: 'active', project: engProject, space: eng }
    })
    expect(await can(bobTeamMember.did, 'write', milestone.id)).toBe(true)
    expect(await can(carolTeamViewer.did, 'write', milestone.id)).toBe(false)
    expect(await can(stranger.did, 'read', milestone.id)).toBe(false)
  })

  it('keeps un-spaced content owner-only (private by default)', async () => {
    const privateTask = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: { title: 'Personal note', status: 'todo' }
    })
    expect(await can(owner.did, 'write', privateTask.id)).toBe(true)
    expect(await can(bobTeamMember.did, 'read', privateTask.id)).toBe(false)
  })

  // ─── Author-owned content: contributor cascade (exploration 0304) ───────────

  describe('contributor cascade for author-owned content (0304)', () => {
    let engChannel: string

    beforeEach(async () => {
      const channel = await store.create({
        schemaId: ChannelSchema.schema['@id'],
        properties: { name: 'general', kind: 'channel', space: eng }
      })
      engChannel = channel.id
    })

    function draftMessage(author: DID) {
      return {
        schemaId: ChatMessageSchema.schema['@id'],
        createdBy: author,
        properties: { channel: engChannel, content: 'hello' }
      }
    }

    it('members may post; only the author or a space admin may edit a message', async () => {
      // The message is authored by the governance identity acting as a
      // regular participant; bob is a fellow Eng member.
      const message = await store.create({
        schemaId: ChatMessageSchema.schema['@id'],
        properties: { channel: engChannel, content: 'from the author' }
      })

      // Fellow member bob may read but NOT edit someone else's message —
      // under the plain cascade his spaceMember rung would have allowed it.
      expect(await can(bobTeamMember.did, 'read', message.id)).toBe(true)
      expect(
        (await evaluator.can({ subject: bobTeamMember.did, action: 'update', nodeId: message.id }))
          .allowed
      ).toBe(false)
      // Legacy write checks follow the update rule.
      expect(await can(bobTeamMember.did, 'write', message.id)).toBe(false)

      // The author edits their own message; an org admin moderates.
      expect(
        (await evaluator.can({ subject: owner.did, action: 'update', nodeId: message.id })).allowed
      ).toBe(true)
      expect(
        (await evaluator.can({ subject: aliceOrgAdmin.did, action: 'update', nodeId: message.id }))
          .allowed
      ).toBe(true)
    })

    it('gates message creation on channel-space membership (draft-node check)', async () => {
      const checkCreate = async (author: DID) =>
        (
          await evaluator.can({
            subject: author,
            action: 'create',
            nodeId: 'draft-message',
            node: draftMessage(author)
          })
        ).allowed

      // Member and org admin may post into the Eng channel.
      expect(await checkCreate(bobTeamMember.did)).toBe(true)
      expect(await checkCreate(aliceOrgAdmin.did)).toBe(true)
      // A viewer may not post, nor may a stranger.
      expect(await checkCreate(carolTeamViewer.did)).toBe(false)
      expect(await checkCreate(stranger.did)).toBe(false)
      // Sharp edge, by design: creating the Space does not make one a member —
      // the governance identity must hold a membership edge to post.
      expect(await checkCreate(owner.did)).toBe(false)
    })

    it("admits a member's remote message create and rejects a stranger's (0304 regression)", async () => {
      // A receiving store with the evaluator wired into sync: before 0304 every
      // remote create was checked as `write` on a node that does not exist yet,
      // so collaborator creates were silently dropped.
      const receiver = createIdentity()
      const receiverAdapter = new MemoryNodeStorageAdapter()
      const reader = new NodeStore({
        storage: receiverAdapter,
        authorDID: receiver.did,
        signingKey: receiver.privateKey
      })
      await reader.initialize()
      const receiverEvaluator = new DefaultPolicyEvaluator({
        store: reader,
        schemaRegistry: registry()
      })
      const rejected: string[] = []
      const receiverStore = new NodeStore({
        storage: receiverAdapter,
        authorDID: receiver.did,
        signingKey: receiver.privateKey,
        authEvaluator: receiverEvaluator,
        onUnauthorizedRemoteChange: ({ change }) => {
          rejected.push(change.payload.nodeId)
        }
      })
      await receiverStore.initialize()

      // Replay the shared workspace (spaces, memberships, channel, …).
      await receiverStore.applyRemoteChanges(await store.getAllChanges())
      expect(await reader.get(engChannel)).not.toBeNull()

      // Bob (Eng member) authors a message in his own store…
      const bobStore = await createStore(bobTeamMember)
      await bobStore.applyRemoteChanges(await store.getAllChanges())
      const bobMessage = await bobStore.create({
        schemaId: ChatMessageSchema.schema['@id'],
        properties: { channel: engChannel, content: 'hi from bob' }
      })
      const [bobCreate] = await bobStore.getChanges(bobMessage.id)

      // …and the receiver admits it via the channel-space membership.
      await receiverStore.applyRemoteChange(bobCreate)
      expect(await reader.get(bobMessage.id)).not.toBeNull()
      expect(rejected).toEqual([])

      // A stranger's message into the same channel is rejected.
      const strangerStore = await createStore(stranger)
      await strangerStore.applyRemoteChanges(await store.getAllChanges())
      const strangerMessage = await strangerStore.create({
        schemaId: ChatMessageSchema.schema['@id'],
        properties: { channel: engChannel, content: 'let me in' }
      })
      const [strangerCreate] = await strangerStore.getChanges(strangerMessage.id)

      await receiverStore.applyRemoteChange(strangerCreate)
      expect(await reader.get(strangerMessage.id)).toBeNull()
      expect(rejected).toEqual([strangerMessage.id])
    })
  })
})
