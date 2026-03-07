import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_API_PORT, resolveLocalAPIPort } from './local-api-config'

describe('resolveLocalAPIPort', () => {
  it('uses the default port for the default profile', () => {
    expect(resolveLocalAPIPort('default')).toBe(DEFAULT_LOCAL_API_PORT)
  })

  it('derives a stable alternate port for numbered profiles', () => {
    expect(resolveLocalAPIPort('user2')).toBe(DEFAULT_LOCAL_API_PORT + 2)
    expect(resolveLocalAPIPort('user9')).toBe(DEFAULT_LOCAL_API_PORT + 9)
  })

  it('uses an explicit environment override when it is valid', () => {
    expect(resolveLocalAPIPort('user2', '32000')).toBe(32000)
  })

  it('ignores invalid explicit overrides', () => {
    expect(resolveLocalAPIPort('user2', 'not-a-port')).toBe(DEFAULT_LOCAL_API_PORT + 2)
    expect(resolveLocalAPIPort('user2', '70000')).toBe(DEFAULT_LOCAL_API_PORT + 2)
  })
})
