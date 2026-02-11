import { AUTH_ACTIONS } from '@xnet/core'
import { describe, expect, it } from 'vitest'
import {
  HUB_ACTION_MAP,
  verifyHubCapability,
  type HubCapability,
  type HubAction
} from '../src/auth/capabilities'

describe('hub capabilities', () => {
  it('maps every hub action to a valid canonical action', () => {
    for (const action of Object.values(HUB_ACTION_MAP)) {
      expect(AUTH_ACTIONS).toContain(action)
    }
  })

  it('covers required canonical actions', () => {
    const mapped = new Set(Object.values(HUB_ACTION_MAP))
    expect(mapped.has('read')).toBe(true)
    expect(mapped.has('write')).toBe(true)
    expect(mapped.has('admin')).toBe(true)
  })

  it('accepts canonical xnet capabilities', () => {
    const capabilities: HubCapability[] = [{ with: '*', can: 'xnet/read' }]
    expect(verifyHubCapability(capabilities, 'hub/query')).toBe(true)
    expect(verifyHubCapability(capabilities, 'hub/connect')).toBe(true)
    expect(verifyHubCapability(capabilities, 'hub/relay')).toBe(false)
  })

  it('accepts legacy hub capabilities', () => {
    const capabilities: HubCapability[] = [{ with: '*', can: 'hub/relay' }]
    expect(verifyHubCapability(capabilities, 'hub/relay')).toBe(true)
    expect(verifyHubCapability(capabilities, 'hub/query')).toBe(false)
  })

  it('accepts wildcard capabilities', () => {
    const xnetWildcard: HubCapability[] = [{ with: '*', can: 'xnet/*' }]
    const fullWildcard: HubCapability[] = [{ with: '*', can: '*' }]

    for (const action of Object.keys(HUB_ACTION_MAP) as HubAction[]) {
      expect(verifyHubCapability(xnetWildcard, action)).toBe(true)
      expect(verifyHubCapability(fullWildcard, action)).toBe(true)
    }
  })
})
