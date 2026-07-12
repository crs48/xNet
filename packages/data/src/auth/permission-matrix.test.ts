import { describe, it, expect } from 'vitest'
import {
  spaceCascadeAuthorization,
  spaceContributorAuthorization
} from '../schema/schemas/space-authorization'
import { buildPermissionMatrix, describeRoleResolver } from './permission-matrix'
import { presets } from './presets'
import { serializeAuthorization } from './serialize'

describe('buildPermissionMatrix', () => {
  it('summarizes a private preset (owner-only)', () => {
    const matrix = buildPermissionMatrix(serializeAuthorization(presets.private()))
    expect(matrix.roles.map((r) => r.role)).toEqual(['owner'])
    const read = matrix.actions.find((a) => a.action === 'read')!
    expect(read.roles).toEqual(['owner'])
    expect(read.public).toBe(false)
  })

  it('flags public actions on a publicRead preset', () => {
    const matrix = buildPermissionMatrix(serializeAuthorization(presets.publicRead()))
    const read = matrix.actions.find((a) => a.action === 'read')!
    const write = matrix.actions.find((a) => a.action === 'write')!
    expect(read.public).toBe(true)
    expect(write.public).toBe(false)
    expect(write.roles).toContain('owner')
  })

  it('reflects the space cascade roles and per-action allow sets', () => {
    const matrix = buildPermissionMatrix(serializeAuthorization(spaceCascadeAuthorization()))
    expect(matrix.roles.map((r) => r.role)).toContain('spaceMember')

    const write = matrix.actions.find((a) => a.action === 'write')!
    expect(write.roles).toEqual(
      expect.arrayContaining(['owner', 'spaceOwner', 'spaceAdmin', 'spaceMember'])
    )
    // members below 'member' cannot write
    expect(write.roles).not.toContain('spaceViewer')

    const del = matrix.actions.find((a) => a.action === 'delete')!
    expect(del.roles).not.toContain('spaceMember')
  })

  it('orders canonical actions first', () => {
    const matrix = buildPermissionMatrix(serializeAuthorization(spaceCascadeAuthorization()))
    const order = matrix.actions.map((a) => a.action)
    expect(order.slice(0, 3)).toEqual(['read', 'write', 'delete'])
  })

  it('renders create/update rows only for schemas that declare them (0304)', () => {
    // The contributor cascade declares the refinements — rows appear in
    // canonical order with their own allow sets.
    const contributor = buildPermissionMatrix(
      serializeAuthorization(spaceContributorAuthorization())
    )
    expect(contributor.actions.map((a) => a.action)).toEqual([
      'read',
      'create',
      'update',
      'write',
      'delete',
      'share'
    ])
    const create = contributor.actions.find((a) => a.action === 'create')!
    const update = contributor.actions.find((a) => a.action === 'update')!
    expect(create.roles).toContain('spaceMember')
    expect(create.roles).not.toContain('owner')
    expect(update.roles).toContain('owner')
    expect(update.roles).not.toContain('spaceMember')

    // The plain cascade declares no refinements — only write is shown.
    const cascade = buildPermissionMatrix(serializeAuthorization(spaceCascadeAuthorization()))
    const cascadeActions = cascade.actions.map((a) => a.action)
    expect(cascadeActions).not.toContain('create')
    expect(cascadeActions).not.toContain('update')
    expect(cascadeActions).toContain('write')
  })

  it('treats an unauthorized schema as fully public', () => {
    const matrix = buildPermissionMatrix(undefined)
    expect(matrix.roles).toEqual([])
    expect(matrix.actions.every((a) => a.public)).toBe(true)
  })

  it('describes role provenance', () => {
    expect(describeRoleResolver({ _tag: 'creator' })).toBe('Node creator')
    expect(
      describeRoleResolver({ _tag: 'relation', relationName: 'space', targetRole: 'spaceOwner' })
    ).toMatch(/Inherited from "space"/)
  })
})
