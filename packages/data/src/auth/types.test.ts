import type { ActionKey, RoleKey, SchemaAction } from '@xnet/core'
import { describe, expectTypeOf, it } from 'vitest'
import { allow, role } from './builders'

describe('authorization typing', () => {
  it('infers action and role keys from schema authorization blocks', () => {
    const authorization = {
      roles: {
        owner: role.creator(),
        assignee: role.property('assignee'),
        editor: role.property('editors')
      },
      actions: {
        read: allow('owner', 'assignee', 'editor'),
        write: allow('owner', 'editor'),
        share: allow('owner')
      }
    }

    type Auth = typeof authorization
    type Action = ActionKey<Auth>
    type Role = RoleKey<Auth>
    type SchemaLevelAction = SchemaAction<{ authorization: Auth }>

    expectTypeOf<Action>().toEqualTypeOf<'read' | 'write' | 'share'>()
    expectTypeOf<Role>().toEqualTypeOf<'owner' | 'assignee' | 'editor'>()
    expectTypeOf<SchemaLevelAction>().toEqualTypeOf<'read' | 'write' | 'share'>()
  })
})
