import { describe, expect, it } from 'vitest'
import { replicateArgs, restoreArgs } from './commands'

describe('restoreArgs', () => {
  it('defaults to an idempotent restore-on-boot', () => {
    expect(restoreArgs('/data/hub.db')).toEqual([
      'restore',
      '-if-db-not-exists',
      '-if-replica-exists',
      '/data/hub.db'
    ])
  })

  it('includes the config path and respects flag overrides', () => {
    expect(
      restoreArgs('/data/hub.db', {
        configPath: '/etc/litestream.yml',
        ifDbNotExists: false,
        ifReplicaExists: false
      })
    ).toEqual(['restore', '-config', '/etc/litestream.yml', '/data/hub.db'])
  })

  it('requires a dbPath', () => {
    expect(() => restoreArgs('')).toThrow(/requires a dbPath/)
  })
})

describe('replicateArgs', () => {
  it('builds a bare replicate', () => {
    expect(replicateArgs()).toEqual(['replicate'])
  })

  it('supports -config and the -exec supervisor (entrypoint) pattern', () => {
    expect(replicateArgs({ configPath: '/etc/litestream.yml', exec: 'node hub.js' })).toEqual([
      'replicate',
      '-config',
      '/etc/litestream.yml',
      '-exec',
      'node hub.js'
    ])
  })
})
