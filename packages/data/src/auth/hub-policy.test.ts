/**
 * Schema ↔ hub grant parity (exploration 0192).
 *
 * The Space cascade (`spaceCascadeAuthorization`, declared on content schemas)
 * and the hub's `spaceRoleGrantActions` mapping must describe the same access
 * ladder. This test derives the hub actions implied by the schema and asserts
 * they match `spaceRoleGrantActions` for every Space role — so changing one
 * without the other turns CI red.
 */
import { describe, expect, it } from 'vitest'
import { defineSchema } from '../schema/define'
import { person } from '../schema/properties'
import { TaskSchema, SPACE_ROLES, spaceRoleGrantActions } from '../schema/schemas'
import { schemaToHubPolicy, hubActionsForSpaceRole } from './hub-policy'
import { allow, role } from '.'

describe('schemaToHubPolicy', () => {
  it('projects schema actions onto the hub grant vocabulary (delete → admin)', () => {
    const policy = schemaToHubPolicy(TaskSchema.schema)
    // The cascade grants admins read+write+delete+share → read/write/admin/share.
    expect(policy.roleActions.spaceAdmin).toEqual(['admin', 'read', 'share', 'write'])
    // Viewers only read.
    expect(policy.roleActions.spaceViewer).toEqual(['read'])
    expect(policy.public).toBe(false)
  })

  it('reports public read when the schema grants PUBLIC', () => {
    const PublicDoc = defineSchema({
      name: 'PublicDoc',
      namespace: 'xnet://test/',
      properties: {},
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
    expect(schemaToHubPolicy(PublicDoc.schema).public).toBe(true)
  })

  it('projects the create/update refinements onto hub write (0304)', () => {
    const ContributorDoc = defineSchema({
      name: 'HubContributorDoc',
      namespace: 'xnet://test/',
      properties: { contributors: person({ multiple: true }) },
      authorization: {
        roles: { owner: role.creator(), contributor: role.property('contributors') },
        actions: {
          read: allow('owner', 'contributor'),
          create: allow('contributor'),
          update: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      }
    })
    const policy = schemaToHubPolicy(ContributorDoc.schema)
    // The hub grant model stays coarse: both refinements need the write relay
    // capability, so create-only contributors project onto hub write.
    expect(policy.roleActions.contributor).toEqual(['read', 'write'])
    expect(policy.roleActions.owner).toEqual(['admin', 'read', 'share', 'write'])
  })

  it('returns an empty policy for legacy (authorization-less) schemas', () => {
    const Legacy = defineSchema({
      name: 'Legacy',
      namespace: 'xnet://test/',
      properties: {}
    })
    expect(schemaToHubPolicy(Legacy.schema)).toEqual({ roleActions: {}, public: false })
  })
})

describe('schema ↔ hub grant parity', () => {
  it('cascade hub actions match spaceRoleGrantActions for every Space role', () => {
    for (const spaceRole of SPACE_ROLES) {
      const fromSchema = new Set(hubActionsForSpaceRole(TaskSchema.schema, spaceRole))
      // `comment` is a hub-only refinement of `read` not modeled by the cascade.
      const expected = new Set(
        spaceRoleGrantActions(spaceRole).filter((action) => action !== 'comment')
      )
      expect(fromSchema, `space role: ${spaceRole}`).toEqual(expected)
    }
  })
})
