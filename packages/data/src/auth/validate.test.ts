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
})
