import { describe, it, expect } from 'vitest'
import { spaceCascadeAuthorization } from '../schema/schemas/space-authorization'
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
