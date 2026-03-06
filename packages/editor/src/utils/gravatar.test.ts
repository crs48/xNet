import { describe, expect, it } from 'vitest'
import { createGravatarUrl, md5 } from './gravatar'

describe('gravatar', () => {
  it('computes stable md5 hashes', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('creates identicon gravatar URLs', () => {
    expect(createGravatarUrl('did:key:z6MkExample', 40)).toBe(
      `https://www.gravatar.com/avatar/${md5('did:key:z6mkexample')}?d=identicon&s=40`
    )
  })
})
