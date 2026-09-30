import { describe, expect, it } from 'vitest'
import { resolveProfilePath } from './profile-path'

const daily = '/profiles/xnet-desktop'

describe('protected daily profile', () => {
  it('keeps packaged default data and identity in their existing home', () => {
    expect(resolveProfilePath(daily, true)).toEqual({ profile: 'default', userData: daily })
  })

  it.each(['default', 'user2', 'wt-feature', 'daily'])(
    'isolates a source launch even with an explicit %s profile',
    (profile) => {
      const dev = resolveProfilePath(daily, false, profile)
      expect(dev.userData).not.toBe(daily)
      expect(dev.userData).not.toBe(resolveProfilePath(daily, true, profile).userData)
      expect(dev.profile).toBe(`dev-${profile}`)
    }
  )

  it('prevents a packaged profile from aliasing a development profile', () => {
    expect(() => resolveProfilePath(daily, true, 'dev-default')).toThrow('reserved')
    expect(resolveProfilePath(daily, false, 'dev-default').profile).toBe('dev-dev-default')
  })

  it.each(['../default', '../../xnet-desktop', '/profiles', '', 'a/b', 'a\\b'])(
    'rejects profile path traversal: %s',
    (profile) =>
      expect(() => resolveProfilePath(daily, false, profile)).toThrow('Invalid xNet profile')
  )
})
