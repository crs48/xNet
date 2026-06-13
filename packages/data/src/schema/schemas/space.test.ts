import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  SPACE_SCHEMA_IRI,
  SPACE_KINDS,
  SPACE_ROLES,
  SpaceSchema,
  buildSpaceTree,
  compareSpaceRoles,
  effectiveSpaceRole,
  canManageSpace,
  spaceAncestorIds,
  spaceRoleGrantActions,
  spaceRoleToShareRole,
  wouldCreateSpaceCycle,
  type SpaceLike,
  type SpaceRole
} from './space'
import {
  SPACE_MEMBERSHIP_SCHEMA_IRI,
  SpaceMembershipSchema,
  isSpaceRole,
  spaceMembershipId
} from './space-membership'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

const byId = (spaces: SpaceLike[]): Map<string, SpaceLike> =>
  new Map(spaces.map((space) => [space.id, space]))

describe('SpaceSchema', () => {
  it('has the expected identity', () => {
    expect(SpaceSchema.schema['@id']).toBe(SPACE_SCHEMA_IRI)
    expect(SpaceSchema.schema.name).toBe('Space')
    expect(SpaceSchema.schema.version).toBe('1.0.0')
  })

  it('creates a space with kind, parent, and visibility defaults', () => {
    const space = SpaceSchema.create(
      { name: 'Acme Eng', kind: 'team', parent: 'org-1' },
      { createdBy: testDID }
    )
    expect(space.name).toBe('Acme Eng')
    expect(space.kind).toBe('team')
    expect(space.parent).toBe('org-1')
    expect(space.visibility).toBe('private')
    expect(SpaceSchema.validate(space).valid).toBe(true)
  })

  it('requires a name', () => {
    const space = SpaceSchema.create({} as never, { createdBy: testDID })
    expect(SpaceSchema.validate(space).valid).toBe(false)
  })

  it('accepts every declared kind', () => {
    for (const kind of SPACE_KINDS) {
      const space = SpaceSchema.create({ name: `s-${kind}`, kind }, { createdBy: testDID })
      expect(SpaceSchema.validate(space).valid).toBe(true)
    }
  })
})

describe('space roles', () => {
  it('orders roles least → most privileged', () => {
    expect(SPACE_ROLES).toEqual(['viewer', 'commenter', 'member', 'admin', 'owner'])
    expect(compareSpaceRoles('viewer', 'owner')).toBeLessThan(0)
    expect(compareSpaceRoles('admin', 'member')).toBeGreaterThan(0)
    expect(compareSpaceRoles('member', 'member')).toBe(0)
  })

  it('picks the most permissive effective role', () => {
    expect(effectiveSpaceRole(['viewer', 'admin', 'member'])).toBe('admin')
    expect(effectiveSpaceRole([])).toBeNull()
  })

  it('maps roles to grant actions', () => {
    expect(spaceRoleGrantActions('viewer')).toEqual(['read'])
    expect(spaceRoleGrantActions('commenter')).toEqual(['read', 'comment'])
    expect(spaceRoleGrantActions('member')).toEqual(['read', 'comment', 'write'])
    expect(spaceRoleGrantActions('admin')).toContain('admin')
    expect(spaceRoleGrantActions('owner')).toContain('share')
  })

  it('maps roles to coarse share roles', () => {
    expect(spaceRoleToShareRole('viewer')).toBe('read')
    expect(spaceRoleToShareRole('commenter')).toBe('comment')
    expect(spaceRoleToShareRole('member')).toBe('write')
    expect(spaceRoleToShareRole('admin')).toBe('write')
  })

  it('identifies managing roles', () => {
    expect(canManageSpace('admin')).toBe(true)
    expect(canManageSpace('owner')).toBe(true)
    expect(canManageSpace('member')).toBe(false)
    expect(canManageSpace('viewer')).toBe(false)
  })
})

describe('space nesting helpers', () => {
  const spaces: SpaceLike[] = [
    { id: 'org', name: 'Acme', parent: null },
    { id: 'eng', name: 'Engineering', parent: 'org' },
    { id: 'auth', name: 'Auth rewrite', parent: 'eng' }
  ]

  it('resolves ancestors nearest-first', () => {
    expect(spaceAncestorIds('auth', byId(spaces))).toEqual(['eng', 'org'])
  })

  it('detects cycles when re-parenting', () => {
    expect(wouldCreateSpaceCycle('org', 'auth', byId(spaces))).toBe(true)
    expect(wouldCreateSpaceCycle('auth', 'org', byId(spaces))).toBe(false)
  })

  it('builds a nesting tree', () => {
    const tree = buildSpaceTree(spaces)
    expect(tree).toHaveLength(1)
    expect(tree[0].folder.id).toBe('org')
    expect(tree[0].children[0].folder.id).toBe('eng')
    expect(tree[0].children[0].children[0].folder.id).toBe('auth')
  })
})

describe('SpaceMembershipSchema', () => {
  it('has the expected identity', () => {
    expect(SpaceMembershipSchema.schema['@id']).toBe(SPACE_MEMBERSHIP_SCHEMA_IRI)
    expect(SpaceMembershipSchema.schema.name).toBe('SpaceMembership')
  })

  it('creates a membership edge', () => {
    const m = SpaceMembershipSchema.create(
      { space: 'space-1', member: testDID, role: 'member', addedAt: 1 },
      { createdBy: testDID }
    )
    expect(m.space).toBe('space-1')
    expect(m.member).toBe(testDID)
    expect(m.role).toBe('member')
    expect(SpaceMembershipSchema.validate(m).valid).toBe(true)
  })

  it('derives a deterministic membership id', () => {
    expect(spaceMembershipId('s1', testDID)).toBe(`spacemember:s1:${testDID}`)
    expect(spaceMembershipId('s1', testDID)).toBe(spaceMembershipId('s1', testDID))
  })

  it('narrows space roles', () => {
    expect(isSpaceRole('admin')).toBe(true)
    expect(isSpaceRole('nope')).toBe(false)
    const role: SpaceRole = 'owner'
    expect(isSpaceRole(role)).toBe(true)
  })
})
