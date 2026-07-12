import { describe, expect, it } from 'vitest'
import { TaggedError, isTagged } from './tagged'

class AlphaError extends TaggedError<'AlphaError'> {
  readonly _tag = 'AlphaError'
  constructor(
    readonly code: 'A_ONE' | 'A_TWO',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

class BetaError extends TaggedError<'BetaError'> {
  readonly _tag = 'BetaError'
}

describe('TaggedError', () => {
  it('is an Error with name set to the subclass name', () => {
    const err = new AlphaError('A_ONE', 'boom')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(TaggedError)
    expect(err.name).toBe('AlphaError')
    expect(err.message).toBe('boom')
    expect(err.code).toBe('A_ONE')
  })

  it('chains causes through ErrorOptions', () => {
    const cause = new Error('root')
    const err = new AlphaError('A_TWO', 'wrapped', { cause })
    expect(err.cause).toBe(cause)
  })

  it('isTagged narrows by tag and rejects other tags and non-errors', () => {
    const err: unknown = new AlphaError('A_ONE', 'boom')
    expect(isTagged(err, 'AlphaError')).toBe(true)
    expect(isTagged(err, 'BetaError')).toBe(false)
    expect(isTagged(new BetaError('b'), 'BetaError')).toBe(true)
    expect(isTagged(new Error('plain'), 'AlphaError')).toBe(false)
    expect(isTagged(null, 'AlphaError')).toBe(false)
    expect(isTagged('AlphaError', 'AlphaError')).toBe(false)
  })
})
