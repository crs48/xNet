import { describe, expect, it } from 'vitest'
import { InMemoryDocStore } from '../stores/durable'
import { OperatorRegistry, hasOperatorRole, type OperatorBinding } from './operator'

const T0 = Date.UTC(2026, 6, 1)

describe('hasOperatorRole', () => {
  it('accepts the role as a single claim or in a list', () => {
    expect(hasOperatorRole({ role: 'operator' })).toBe(true)
    expect(hasOperatorRole({ roles: ['member', 'operator'] })).toBe(true)
  })

  it('rejects absent, empty, or non-operator claims', () => {
    expect(hasOperatorRole(null)).toBe(false)
    expect(hasOperatorRole(undefined)).toBe(false)
    expect(hasOperatorRole({})).toBe(false)
    expect(hasOperatorRole({ role: 'member' })).toBe(false)
    expect(hasOperatorRole({ roles: [] })).toBe(false)
  })

  // A malformed claim is not a role. Coercing it would let a truthy non-string
  // through as authorisation.
  it('rejects claims that are not strings', () => {
    expect(hasOperatorRole({ role: 1 as unknown as string })).toBe(false)
    expect(hasOperatorRole({ role: true as unknown as string })).toBe(false)
    expect(hasOperatorRole({ roles: [{ name: 'operator' }] as unknown as string[] })).toBe(false)
    expect(hasOperatorRole({ roles: 'operator' as unknown as string[] })).toBe(false)
  })
})

describe('OperatorRegistry', () => {
  const setup = () => new OperatorRegistry(new InMemoryDocStore<OperatorBinding>())

  it('binds and resolves a signing key', async () => {
    const reg = setup()
    await reg.bind('user_1', 'did:key:zAbc', T0)
    expect(await reg.active('user_1')).toMatchObject({ did: 'did:key:zAbc', boundAtMs: T0 })
  })

  it('rejects a value that is not a DID', async () => {
    await expect(setup().bind('user_1', 'zAbc', T0)).rejects.toThrow(/Not a DID/)
  })

  it('returns null for an unknown operator', async () => {
    expect(await setup().active('nobody')).toBeNull()
  })

  // Audit entries are kept 12 months and name the DID that signed them, so a
  // retired key must stay resolvable or a year of history becomes unattributable.
  it('stops resolving a retired binding but keeps it for historical verification', async () => {
    const reg = setup()
    await reg.bind('user_1', 'did:key:zAbc', T0)
    await reg.retire('user_1', T0 + 1000)
    expect(await reg.active('user_1')).toBeNull()
    expect(await reg.resolveHistorical('user_1')).toMatchObject({
      did: 'did:key:zAbc',
      retiredAtMs: T0 + 1000
    })
  })

  it('retiring an unknown operator is a no-op, not an error', async () => {
    await expect(setup().retire('nobody', T0)).resolves.toBeUndefined()
  })

  it('rebinding replaces the active key', async () => {
    const reg = setup()
    await reg.bind('user_1', 'did:key:zOld', T0)
    await reg.bind('user_1', 'did:key:zNew', T0 + 1)
    expect((await reg.active('user_1'))?.did).toBe('did:key:zNew')
  })
})
