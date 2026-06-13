import { describe, expect, it } from 'vitest'
import { litestreamWalPragmas } from './litestream'

describe('litestreamWalPragmas', () => {
  it('disables WAL autocheckpoint only when running under Litestream', () => {
    expect(litestreamWalPragmas({ LITESTREAM: '1' })).toEqual(['wal_autocheckpoint = 0'])
  })

  it('returns nothing for self-host (keeps SQLite default autocheckpoint)', () => {
    expect(litestreamWalPragmas({})).toEqual([])
    expect(litestreamWalPragmas({ LITESTREAM: '0' })).toEqual([])
  })
})
