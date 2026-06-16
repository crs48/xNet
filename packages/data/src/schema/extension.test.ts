import { describe, it, expect } from 'vitest'
import { EXT_PREFIX, extKey, isExtKey, parseExtKey } from './extension'

describe('extension namespace helpers', () => {
  it('builds namespaced keys', () => {
    expect(extKey('acme.com', 'leadScore')).toBe('ext:acme.com/leadScore')
    expect(extKey('acme.com', 'leadScore').startsWith(EXT_PREFIX)).toBe(true)
  })

  it('supports DID authorities (contain ":" but no "/")', () => {
    const key = extKey('did:key:z6MkExample', 'notes')
    expect(key).toBe('ext:did:key:z6MkExample/notes')
    expect(parseExtKey(key)).toEqual({ authority: 'did:key:z6MkExample', field: 'notes' })
  })

  it('round-trips authority and field', () => {
    const key = extKey('space-123', 'next_touch')
    expect(parseExtKey(key)).toEqual({ authority: 'space-123', field: 'next_touch' })
  })

  it('recognizes extension keys', () => {
    expect(isExtKey('ext:acme.com/leadScore')).toBe(true)
    expect(isExtKey('status')).toBe(false)
    expect(isExtKey('cell_status')).toBe(false)
    expect(isExtKey('ext:')).toBe(false)
    expect(isExtKey('ext:acme.com')).toBe(false) // no field segment
    expect(isExtKey('ext:/leadScore')).toBe(false) // empty authority
  })

  it('rejects malformed authority/field on build', () => {
    expect(() => extKey('has/slash', 'x')).toThrow()
    expect(() => extKey('', 'x')).toThrow()
    expect(() => extKey('acme.com', 'has/slash')).toThrow()
    expect(() => extKey('acme.com', '')).toThrow()
    expect(() => extKey('white space', 'x')).toThrow()
  })

  it('parseExtKey returns null for non-extension keys', () => {
    expect(parseExtKey('title')).toBeNull()
    expect(parseExtKey('ext:onlyauthority')).toBeNull()
    expect(parseExtKey('notext:acme.com/x')).toBeNull()
  })
})
