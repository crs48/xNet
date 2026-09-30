import { describe, expect, it } from 'vitest'
import { resolveProfilePath } from './profile-path'

const daily = '/profiles/xnet-desktop'

describe('protected daily profile', () => {
  it('keeps packaged default data and identity in their existing home', () => {
    expect(resolveProfilePath(daily, true)).toEqual({ profile: 'default', userData: daily })
  })

  it.each(['default', 'user2', 'wt-feature', 'daily', 'dev-default'])(
    'isolates a source launch even with an explicit %s profile',
    (profile) => {
      const dev = resolveProfilePath(daily, false, profile)
      expect(dev.userData).not.toBe(daily)
      expect(dev.userData).not.toBe(resolveProfilePath(daily, true, profile).userData)
      expect(dev.profile).toBe(`dev-${profile}`)
    }
  )

  it.each(['../default', '../../xnet-desktop', '/profiles', '', 'a/b', 'a\\b'])(
    'rejects profile path traversal: %s',
    (profile) =>
      expect(() => resolveProfilePath(daily, false, profile)).toThrow('Invalid xNet profile')
  )
})
