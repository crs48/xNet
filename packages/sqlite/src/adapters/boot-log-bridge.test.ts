import { describe, expect, it } from 'vitest'
import { bootLogMessage, readBootLogArgs } from './boot-log-bridge'

describe('boot-log-bridge', () => {
  it('round-trips console args through the message envelope', () => {
    const args = ['[xNet] db stats @ open', { bytes: 1234, freelistCount: 7 }]
    const message = bootLogMessage(args)

    expect(readBootLogArgs(message)).toEqual(args)
  })

  it('preserves arg order and types (string + object)', () => {
    const args: unknown[] = [
      '[xNet] sqlite op',
      'query',
      { lane: 'interactive', queueMs: 18742, execMs: 3 }
    ]
    expect(readBootLogArgs(bootLogMessage(args))).toEqual(args)
  })

  it('survives structured clone (postMessage transport)', () => {
    const args = ['[xNet] sqlite op', 'vacuum', { execMs: 19010 }]
    const cloned = structuredClone(bootLogMessage(args))
    expect(readBootLogArgs(cloned)).toEqual(args)
  })

  it('ignores Comlink-shaped RPC responses', () => {
    // A Comlink response is keyed by `id`, never our discriminator.
    expect(readBootLogArgs({ id: 'abc123', type: 'RETURN', value: 42 })).toBeNull()
  })

  it('ignores non-object and empty messages', () => {
    expect(readBootLogArgs(null)).toBeNull()
    expect(readBootLogArgs(undefined)).toBeNull()
    expect(readBootLogArgs('string')).toBeNull()
    expect(readBootLogArgs(123)).toBeNull()
    expect(readBootLogArgs({})).toBeNull()
  })

  it('rejects a message whose discriminator is not an array', () => {
    expect(readBootLogArgs({ __xnetSqliteBootLog: 'not-an-array' })).toBeNull()
  })

  it('accepts an empty arg list', () => {
    expect(readBootLogArgs(bootLogMessage([]))).toEqual([])
  })
})
