import type {
  ActionKey,
  AuthAction,
  AuthorizationDefinition,
  Capability,
  RoleKey,
  SchemaAction
} from './auth-types'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { actionExpressionOrder, grantActionSatisfies } from './auth-types'

type TaskAuth = AuthorizationDefinition<
  {
    read: { _tag: 'allow'; roles: readonly ['viewer', 'owner'] }
    write: { _tag: 'allow'; roles: readonly ['editor', 'owner'] }
    share: { _tag: 'allow'; roles: readonly ['owner'] }
  },
  {
    owner: { _tag: 'creator' }
    viewer: { _tag: 'property'; propertyName: 'watchers' }
    editor: { _tag: 'property'; propertyName: 'editors' }
  }
>

type TaskSchema = {
  authorization: TaskAuth
}

describe('auth type utilities', () => {
  it('keeps Capability aligned with AuthAction', () => {
    expectTypeOf<Capability>().toEqualTypeOf<AuthAction>()
  })

  it('extracts action keys from authorization definitions', () => {
    expectTypeOf<ActionKey<TaskAuth>>().toEqualTypeOf<'read' | 'write' | 'share'>()
  })

  it('extracts role keys from authorization definitions', () => {
    expectTypeOf<RoleKey<TaskAuth>>().toEqualTypeOf<'owner' | 'viewer' | 'editor'>()
  })

  it('infers schema action union from schema authorization', () => {
    expectTypeOf<SchemaAction<TaskSchema>>().toEqualTypeOf<'read' | 'write' | 'share'>()
  })
})

describe('actionExpressionOrder (0304 write fallback)', () => {
  it('create falls back to write', () => {
    expect(actionExpressionOrder('create')).toEqual(['create', 'write'])
  })

  it('update and legacy write checks share the same lookup', () => {
    expect(actionExpressionOrder('update')).toEqual(['update', 'write'])
    expect(actionExpressionOrder('write')).toEqual(['update', 'write'])
  })

  it('other actions have no fallback', () => {
    expect(actionExpressionOrder('read')).toEqual(['read'])
    expect(actionExpressionOrder('delete')).toEqual(['delete'])
    expect(actionExpressionOrder('share')).toEqual(['share'])
    expect(actionExpressionOrder('admin')).toEqual(['admin'])
  })
})

describe('grantActionSatisfies (0304 write ⊇ create/update)', () => {
  it('a write grant covers create and update', () => {
    expect(grantActionSatisfies('write', 'create')).toBe(true)
    expect(grantActionSatisfies('write', 'update')).toBe(true)
    expect(grantActionSatisfies('write', 'write')).toBe(true)
  })

  it('an update grant covers legacy write checks on existing nodes', () => {
    expect(grantActionSatisfies('update', 'write')).toBe(true)
    expect(grantActionSatisfies('update', 'create')).toBe(false)
  })

  it('a create grant covers only create (fail closed)', () => {
    expect(grantActionSatisfies('create', 'create')).toBe(true)
    expect(grantActionSatisfies('create', 'write')).toBe(false)
    expect(grantActionSatisfies('create', 'update')).toBe(false)
  })

  it('unrelated actions never cross-satisfy', () => {
    expect(grantActionSatisfies('read', 'write')).toBe(false)
    expect(grantActionSatisfies('admin', 'write')).toBe(false)
    expect(grantActionSatisfies('write', 'delete')).toBe(false)
  })
})
