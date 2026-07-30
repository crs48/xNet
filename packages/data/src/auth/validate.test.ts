import type { PropertyDefinition } from '../schema/types'
import type { AuthExpression } from '@xnetjs/core'
import { describe, expect, it } from 'vitest'
import { allow, and } from './builders'
import { validateAuthorization } from './validate'

const BASE_PROPERTIES: Record<string, PropertyDefinition> = {
  owner: {
    '@id': 'xnet://tests/Task/properties/owner',
    name: 'owner',
    type: 'person',
    required: true
  }
}

describe('validateAuthorization', () => {
  it('rejects expressions with more than 50 nodes', () => {
    let expression: AuthExpression = allow('owner')
    for (let i = 0; i < 50; i++) {
      expression = and(expression, allow('owner'))
    }

    const result = validateAuthorization(
      {
        roles: {
          owner: { _tag: 'property', propertyName: 'owner' }
        },
        actions: {
          read: expression
        }
      },
      BASE_PROPERTIES
    )

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.code === 'AUTH_SCHEMA_EXPR_LIMIT_EXCEEDED')).toBe(
      true
    )
  })

  it('rejects PUBLIC on the create/update mutation refinements (0304)', () => {
    const result = validateAuthorization(
      {
        roles: {
          owner: { _tag: 'property', propertyName: 'owner' }
        },
        actions: {
          read: { _tag: 'public' },
          create: { _tag: 'public' },
          update: { _tag: 'public' }
        }
      },
      BASE_PROPERTIES
    )

    expect(result.valid).toBe(false)
    const publicMutations = result.errors.filter(
      (error) => error.code === 'AUTH_SCHEMA_UNSAFE_PUBLIC_MUTATION'
    )
    expect(publicMutations.map((error) => error.path).sort()).toEqual([
      'authorization.actions.create',
      'authorization.actions.update'
    ])
  })

  it('rejects a lone create/update refinement with no write fallback (0304)', () => {
    const onlyCreate = validateAuthorization(
      {
        roles: { owner: { _tag: 'property', propertyName: 'owner' } },
        actions: { read: allow('owner'), create: allow('owner') }
      },
      BASE_PROPERTIES
    )
    expect(onlyCreate.valid).toBe(false)
    expect(
      onlyCreate.errors.some(
        (error) =>
          error.code === 'AUTH_SCHEMA_INCOMPLETE_MUTATION_ACTIONS' &&
          error.path === 'authorization.actions.update'
      )
    ).toBe(true)

    // With a write fallback the lone refinement is fine.
    const withWrite = validateAuthorization(
      {
        roles: { owner: { _tag: 'property', propertyName: 'owner' } },
        actions: { read: allow('owner'), create: allow('owner'), write: allow('owner') }
      },
      BASE_PROPERTIES
    )
    expect(withWrite.valid).toBe(true)

    // Declaring both refinements is a total split — also fine without write.
    const totalSplit = validateAuthorization(
      {
        roles: { owner: { _tag: 'property', propertyName: 'owner' } },
        actions: { read: allow('owner'), create: allow('owner'), update: allow('owner') }
      },
      BASE_PROPERTIES
    )
    expect(totalSplit.valid).toBe(true)
  })
})
