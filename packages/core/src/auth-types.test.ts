import type {
  ActionKey,
  AuthAction,
  AuthorizationDefinition,
  Capability,
  RoleKey,
  SchemaAction
} from './auth-types'
import { describe, expectTypeOf, it } from 'vitest'

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
