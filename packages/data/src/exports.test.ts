import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import * as auth from './auth'
import * as database from './database'
import * as schema from './schema'
import * as store from './store'
import * as awareness from './sync/awareness'
import * as updates from './updates'

describe('@xnetjs/data package exports', () => {
  it('declares explicit subpaths for schema, store, database, auth, updates, and awareness', () => {
    const exportsMap = packageJson.exports as Record<string, unknown>
    expect(exportsMap).toHaveProperty('./schema')
    expect(exportsMap).toHaveProperty('./store')
    expect(exportsMap).toHaveProperty('./database')
    expect(exportsMap).toHaveProperty('./auth')
    expect(exportsMap).toHaveProperty('./updates')
    expect(exportsMap).toHaveProperty('./awareness')
  })

  it('exposes stable schema and store primitives from their subpaths', () => {
    expect(schema.defineSchema).toBeTypeOf('function')
    expect(schema.text).toBeTypeOf('function')
    expect(store.NodeStore).toBeTypeOf('function')
    expect(store.MemoryNodeStorageAdapter).toBeTypeOf('function')
  })

  it('exposes database, auth, updates, and awareness helpers from explicit subpaths', () => {
    expect(database.queryRows).toBeTypeOf('function')
    expect(auth.StoreAuth).toBeTypeOf('function')
    expect(updates.signUpdate).toBeTypeOf('function')
    expect(awareness.createAwareness).toBeTypeOf('function')
  })
})
