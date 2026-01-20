import { describe, it, expect } from 'vitest'
import { hash, hashHex } from './hashing'

describe('Hashing', () => {
  it('should produce 32-byte BLAKE3 hash', () => {
    const data = new TextEncoder().encode('test')
    const result = hash(data)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(32)
  })

  it('should produce 32-byte SHA-256 hash', () => {
    const data = new TextEncoder().encode('test')
    const result = hash(data, 'sha256')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(32)
  })

  it('should be deterministic', () => {
    const data = new TextEncoder().encode('hello')
    expect(hashHex(data)).toBe(hashHex(data))
  })

  it('should produce different hashes for different inputs', () => {
    const a = hashHex(new TextEncoder().encode('a'))
    const b = hashHex(new TextEncoder().encode('b'))
    expect(a).not.toBe(b)
  })

  it('should produce different hashes with different algorithms', () => {
    const data = new TextEncoder().encode('test')
    const blake3Hash = hashHex(data, 'blake3')
    const sha256Hash = hashHex(data, 'sha256')
    expect(blake3Hash).not.toBe(sha256Hash)
  })

  it('should hash 1MB in under 50ms', () => {
    const data = new Uint8Array(1024 * 1024)
    // Warm up
    hash(data)
    const start = performance.now()
    hash(data)
    expect(performance.now() - start).toBeLessThan(50)
  })
})
