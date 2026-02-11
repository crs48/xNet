import type { Schema } from '../schema/types'
import type { NodeState } from '../store'
import type { DID } from '@xnet/core'
import { describe, expect, it, vi } from 'vitest'
import { defineSchema } from '../schema'
import { person, relation, text } from '../schema/properties'
import { allow, role } from './builders'
import { serializeAuthorization } from './serialize'
import { computeRecipients, handleAuthMigration, PUBLIC_RECIPIENT } from './index'

const OWNER_DID = 'did:key:z6Mkowner1234567890' as DID
const EDITOR_DID = 'did:key:z6Mkeditor1234567890' as DID
const GRANTEE_DID = 'did:key:z6Mkgrantee1234567890' as DID

function createNodeState(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: 'node-1',
    schemaId: 'xnet://app/Task@1.0.0',
    properties: {},
    timestamps: {},
    deleted: false,
    createdAt: 1,
    createdBy: OWNER_DID,
    updatedAt: 1,
    updatedBy: OWNER_DID,
    ...overrides
  }
}

function legacySchema(): Schema {
  return {
    '@id': 'xnet://app/Task@1.0.0',
    '@type': 'xnet://xnet.fyi/Schema',
    name: 'Task',
    namespace: 'xnet://app/',
    version: '1.0.0',
    properties: []
  }
}

describe('computeRecipients', () => {
  it('returns creator for legacy schemas without authorization', async () => {
    const schema = legacySchema()
    const node = createNodeState()

    const recipients = await computeRecipients(schema, node, {
      getNode: async () => null
    })

    expect(recipients).toEqual([OWNER_DID])
  })

  it('returns PUBLIC sentinel when read expression is public', async () => {
    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://app/',
      properties: { title: text({ required: true }) },
      authorization: {
        roles: { owner: role.creator() },
        actions: {
          read: { _tag: 'public' },
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      }
    })

    const recipients = await computeRecipients(TaskSchema.schema, createNodeState(), {
      getNode: async () => null
    })

    expect(recipients).toEqual([PUBLIC_RECIPIENT])
  })

  it('includes role members and active grantees', async () => {
    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://app/',
      properties: {
        title: text({ required: true }),
        editors: person({ multiple: true })
      },
      authorization: {
        roles: {
          owner: role.creator(),
          editor: role.property('editors')
        },
        actions: {
          read: allow('owner', 'editor'),
          write: allow('owner', 'editor'),
          delete: allow('owner'),
          share: allow('owner')
        }
      }
    })

    const recipients = await computeRecipients(
      TaskSchema.schema,
      createNodeState({ properties: { editors: [EDITOR_DID] } }),
      {
        getNode: async () => null,
        grantIndex: {
          findGrantsForResource: () => [
            {
              id: 'grant-1',
              properties: {
                actions: JSON.stringify(['read']),
                grantee: GRANTEE_DID
              }
            }
          ]
        }
      }
    )

    expect(new Set(recipients)).toEqual(new Set([OWNER_DID, EDITOR_DID, GRANTEE_DID]))
  })

  it('resolves relation roles via getSchema + getNode callbacks', async () => {
    const ProjectSchema = defineSchema({
      name: 'Project',
      namespace: 'xnet://app/',
      properties: {
        title: text({ required: true }),
        viewers: person({ multiple: true })
      },
      authorization: {
        roles: {
          owner: role.creator(),
          viewer: role.property('viewers')
        },
        actions: {
          read: allow('owner', 'viewer'),
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      }
    })

    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://app/',
      properties: {
        title: text({ required: true }),
        project: relation({ target: 'xnet://app/Project@1.0.0' as const })
      },
      authorization: {
        roles: {
          owner: role.creator(),
          viewer: role.relation('project', 'viewer')
        },
        actions: {
          read: allow('owner', 'viewer'),
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      }
    })

    const projectNode = createNodeState({
      id: 'project-1',
      schemaId: ProjectSchema.schema['@id'],
      properties: { viewers: [EDITOR_DID] }
    })
    const taskNode = createNodeState({
      properties: { project: 'project-1' },
      schemaId: TaskSchema.schema['@id']
    })

    const recipients = await computeRecipients(TaskSchema.schema, taskNode, {
      getNode: async (id) => (id === 'project-1' ? projectNode : null),
      getSchema: async (schemaId) =>
        schemaId === ProjectSchema.schema['@id'] ? ProjectSchema.schema : undefined
    })

    expect(new Set(recipients)).toEqual(new Set([OWNER_DID, EDITOR_DID]))
  })
})

describe('handleAuthMigration', () => {
  it('encrypts existing node when authorization is added', async () => {
    const oldSchema = legacySchema()
    const newSchema = {
      ...oldSchema,
      authorization: serializeAuthorization({
        roles: { owner: role.creator() },
        actions: {
          read: allow('owner'),
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      })
    }

    const encryptExistingNode = vi.fn(async () => {})
    const rotateContentKeyForNode = vi.fn(async () => {})

    await handleAuthMigration(oldSchema, newSchema, createNodeState(), {
      getNode: async () => null,
      encryptExistingNode,
      rotateContentKeyForNode
    })

    expect(encryptExistingNode).toHaveBeenCalledTimes(1)
    expect(rotateContentKeyForNode).not.toHaveBeenCalled()
  })

  it('rotates content key when recipient set changes across auth versions', async () => {
    const oldAuthSchema = {
      ...legacySchema(),
      authorization: serializeAuthorization({
        roles: {
          owner: role.creator(),
          editor: role.property('editors')
        },
        actions: {
          read: allow('owner', 'editor'),
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      })
    }
    const newAuthSchema = {
      ...legacySchema(),
      authorization: serializeAuthorization({
        roles: { owner: role.creator() },
        actions: {
          read: allow('owner'),
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      })
    }

    const rotateContentKeyForNode = vi.fn(async () => {})

    await handleAuthMigration(
      oldAuthSchema,
      newAuthSchema,
      createNodeState({ properties: { editors: [EDITOR_DID] } }),
      {
        getNode: async () => null,
        encryptExistingNode: async () => {},
        rotateContentKeyForNode
      }
    )

    expect(rotateContentKeyForNode).toHaveBeenCalledWith('node-1', [OWNER_DID])
  })
})
