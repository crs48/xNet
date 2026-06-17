/**
 * Tests for the capability-enforcement guard (exploration 0192).
 */

import type { ModuleCapabilities } from '../feature-module'
import { describe, it, expect } from 'vitest'
import {
  CapabilityError,
  matchSchemaIri,
  isSchemaWriteAllowed,
  isSchemaReadAllowed,
  isNetworkAllowed,
  assertSchemaWrite,
  guardStore
} from '../ecosystem/capability-guard'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'
const SECRET = 'xnet://xnet.fyi/Secret@1.0.0'

describe('matchSchemaIri', () => {
  it('matches exact, all, version-wildcard, and prefix patterns', () => {
    expect(matchSchemaIri('*', TASK)).toBe(true)
    expect(matchSchemaIri(TASK, TASK)).toBe(true)
    expect(matchSchemaIri('xnet://xnet.fyi/Task@*', TASK)).toBe(true)
    expect(matchSchemaIri('xnet://xnet.fyi/*', TASK)).toBe(true)
    expect(matchSchemaIri('xnet://xnet.fyi/Task@*', SECRET)).toBe(false)
    expect(matchSchemaIri(SECRET, TASK)).toBe(false)
  })
})

describe('schema/network allow checks', () => {
  const caps: ModuleCapabilities = {
    schemaWrite: ['xnet://xnet.fyi/Task@*'],
    schemaRead: ['xnet://xnet.fyi/Task@1.0.0'],
    network: ['api.stripe.com', '.github.com']
  }

  it('writes default closed; only declared schemas pass', () => {
    expect(isSchemaWriteAllowed(caps, TASK)).toBe(true)
    expect(isSchemaWriteAllowed(caps, SECRET)).toBe(false)
    expect(isSchemaWriteAllowed(undefined, TASK)).toBe(false)
  })

  it('reads default OPEN when no schemaRead declared, restricted when declared', () => {
    expect(isSchemaReadAllowed(undefined, SECRET)).toBe(true)
    expect(isSchemaReadAllowed({}, SECRET)).toBe(true)
    expect(isSchemaReadAllowed(caps, TASK)).toBe(true)
    expect(isSchemaReadAllowed(caps, SECRET)).toBe(false)
  })

  it('network: exact host and subdomain suffix, closed by default', () => {
    expect(isNetworkAllowed(caps, 'https://api.stripe.com/v1/charges')).toBe(true)
    expect(isNetworkAllowed(caps, 'https://api.github.com/repos')).toBe(true)
    expect(isNetworkAllowed(caps, 'github.com')).toBe(true)
    expect(isNetworkAllowed(caps, 'https://evil.com')).toBe(false)
    expect(isNetworkAllowed(undefined, 'api.stripe.com')).toBe(false)
  })
})

describe('assertSchemaWrite', () => {
  it('throws a CapabilityError with structured fields', () => {
    const caps: ModuleCapabilities = { schemaWrite: ['xnet://xnet.fyi/Task@*'] }
    expect(() => assertSchemaWrite(caps, TASK, 'p')).not.toThrow()
    try {
      assertSchemaWrite(caps, SECRET, 'com.me.p')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(CapabilityError)
      const ce = err as CapabilityError
      expect(ce.pluginId).toBe('com.me.p')
      expect(ce.capability).toBe('schemaWrite')
      expect(ce.target).toBe(SECRET)
    }
  })
})

describe('guardStore', () => {
  function fakeStore() {
    const calls: string[] = []
    const nodes = new Map<string, { schemaId: string }>([
      ['n1', { schemaId: TASK }],
      ['n2', { schemaId: SECRET }]
    ])
    return {
      calls,
      store: {
        async create(o: { schemaId: string }) {
          calls.push(`create:${o.schemaId}`)
          return { schemaId: o.schemaId }
        },
        async update(id: string) {
          calls.push(`update:${id}`)
          return {}
        },
        async delete(id: string) {
          calls.push(`delete:${id}`)
        },
        async get(id: string) {
          return nodes.get(id) ?? null
        },
        async list() {
          return [...nodes.values()]
        }
      }
    }
  }

  it('returns the store untouched when nothing is constrained', () => {
    const { store } = fakeStore()
    expect(guardStore(store, undefined, 'p')).toBe(store)
    expect(guardStore(store, {}, 'p')).toBe(store)
  })

  it('allows writes inside the grant and blocks writes outside it', async () => {
    const { store, calls } = fakeStore()
    const caps: ModuleCapabilities = { schemaWrite: ['xnet://xnet.fyi/Task@*'] }
    const guarded = guardStore(store, caps, 'com.me.p')

    await guarded.create({ schemaId: TASK })
    expect(calls).toContain(`create:${TASK}`)

    await expect(guarded.create({ schemaId: SECRET })).rejects.toBeInstanceOf(CapabilityError)
  })

  it('resolves the schema of an updated/deleted node before allowing it', async () => {
    const { store, calls } = fakeStore()
    const caps: ModuleCapabilities = { schemaWrite: ['xnet://xnet.fyi/Task@*'] }
    const guarded = guardStore(store, caps, 'com.me.p')

    await guarded.update('n1') // Task → allowed
    expect(calls).toContain('update:n1')

    await expect(guarded.update('n2')).rejects.toBeInstanceOf(CapabilityError) // Secret
    await expect(guarded.delete('n2')).rejects.toBeInstanceOf(CapabilityError)
  })

  it('passes through non-write methods unchanged', async () => {
    const { store } = fakeStore()
    const caps: ModuleCapabilities = { schemaWrite: ['xnet://xnet.fyi/Task@*'] }
    const guarded = guardStore(store, caps, 'p')
    expect(await guarded.list()).toHaveLength(2)
  })
})
