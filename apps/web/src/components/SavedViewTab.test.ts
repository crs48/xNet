/**
 * Saved-view descriptor parsing tests (0166).
 */
import { describe, expect, it } from 'vitest'
import { parseStoredDescriptor } from './SavedViewTab'

describe('parseStoredDescriptor', () => {
  it('returns null for missing views or empty descriptors', () => {
    expect(parseStoredDescriptor(null)).toBeNull()
    expect(parseStoredDescriptor(undefined)).toBeNull()
    expect(parseStoredDescriptor({})).toBeNull()
    expect(parseStoredDescriptor({ descriptor: '' })).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseStoredDescriptor({ descriptor: 'not json' })).toBeNull()
  })

  it('returns null for JSON that fails descriptor validation', () => {
    expect(parseStoredDescriptor({ descriptor: '{"bogus":true}' })).toBeNull()
  })
})
