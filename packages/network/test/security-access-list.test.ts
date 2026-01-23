import { describe, it, expect, beforeEach } from 'vitest'
import { PeerAccessControl } from '../src/security/access-list'

describe('PeerAccessControl', () => {
  let accessControl: PeerAccessControl

  beforeEach(() => {
    accessControl = new PeerAccessControl()
  })

  describe('canAccess', () => {
    it('should allow by default (no config)', () => {
      expect(accessControl.canAccess('workspace', 'peer1').allowed).toBe(true)
    })

    it('should allow when workspace has config but no blocks', () => {
      accessControl.getConfig('workspace') // Create empty config
      expect(accessControl.canAccess('workspace', 'peer1').allowed).toBe(true)
    })

    it('should block denylisted peers', () => {
      accessControl.addToDenylist('workspace', 'bad-peer', {
        reason: 'spammer',
        addedBy: 'admin',
        auto: false
      })

      const result = accessControl.canAccess('workspace', 'bad-peer')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('denylist')
    })

    it('should allow non-denylisted peers', () => {
      accessControl.addToDenylist('workspace', 'bad-peer', {
        reason: 'spammer',
        addedBy: 'admin',
        auto: false
      })

      expect(accessControl.canAccess('workspace', 'good-peer').allowed).toBe(true)
    })

    it('should block by IP', () => {
      accessControl.addIPToDenylist('workspace', '10.0.0.1', {
        reason: 'malicious IP',
        addedBy: 'system',
        auto: true
      })

      const result = accessControl.canAccess('workspace', 'peer1', '10.0.0.1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('IP blocked')
    })

    it('should respect expiry on deny entries', () => {
      accessControl.addToDenylist('workspace', 'peer1', {
        reason: 'temp block',
        addedBy: 'admin',
        auto: false,
        expiresAt: Date.now() - 1000 // Already expired
      })

      expect(accessControl.canAccess('workspace', 'peer1').allowed).toBe(true)
    })

    it('should block when not expired', () => {
      accessControl.addToDenylist('workspace', 'peer1', {
        reason: 'temp block',
        addedBy: 'admin',
        auto: false,
        expiresAt: Date.now() + 60_000
      })

      expect(accessControl.canAccess('workspace', 'peer1').allowed).toBe(false)
    })
  })

  describe('allowlist mode', () => {
    it('should block non-allowlisted peers', () => {
      accessControl.setAllowlistMode('private', true)

      const result = accessControl.canAccess('private', 'stranger')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('allowlist')
    })

    it('should allow allowlisted peers', () => {
      accessControl.setAllowlistMode('private', true)
      accessControl.addToAllowlist('private', 'friend', {
        addedBy: 'admin',
        label: 'Team member'
      })

      expect(accessControl.canAccess('private', 'friend').allowed).toBe(true)
    })

    it('should deny takes priority over allowlist', () => {
      accessControl.setAllowlistMode('private', true)
      accessControl.addToAllowlist('private', 'peer1', { addedBy: 'admin' })
      accessControl.addToDenylist('private', 'peer1', {
        reason: 'revoked',
        addedBy: 'admin',
        auto: false
      })

      expect(accessControl.canAccess('private', 'peer1').allowed).toBe(false)
    })
  })

  describe('global denylist', () => {
    it('should override workspace allowlist', () => {
      accessControl.setAllowlistMode('workspace', true)
      accessControl.addToAllowlist('workspace', 'peer1', { addedBy: 'admin' })
      accessControl.addToGlobalDenylist('peer1', {
        reason: 'globally banned',
        addedBy: 'system',
        auto: true
      })

      expect(accessControl.canAccess('workspace', 'peer1').allowed).toBe(false)
    })

    it('should be removable', () => {
      accessControl.addToGlobalDenylist('peer1', {
        reason: 'test',
        addedBy: 'system',
        auto: true
      })
      accessControl.removeFromGlobalDenylist('peer1')

      expect(accessControl.canAccess('workspace', 'peer1').allowed).toBe(true)
    })

    it('should block globally blocked IPs', () => {
      accessControl.addIPToDenylist(null, '10.0.0.1', {
        reason: 'malicious',
        addedBy: 'system',
        auto: true
      })

      expect(accessControl.canAccess('any-workspace', 'any-peer', '10.0.0.1').allowed).toBe(false)
    })
  })

  describe('list management', () => {
    it('should remove from denylist', () => {
      accessControl.addToDenylist('ws', 'peer1', { reason: 'test', addedBy: 'a', auto: false })
      accessControl.removeFromDenylist('ws', 'peer1')

      expect(accessControl.canAccess('ws', 'peer1').allowed).toBe(true)
    })

    it('should remove from allowlist', () => {
      accessControl.setAllowlistMode('ws', true)
      accessControl.addToAllowlist('ws', 'peer1', { addedBy: 'admin' })
      accessControl.removeFromAllowlist('ws', 'peer1')

      expect(accessControl.canAccess('ws', 'peer1').allowed).toBe(false)
    })

    it('should return denylist entries', () => {
      accessControl.addToDenylist('ws', 'p1', { reason: 'r1', addedBy: 'a', auto: false })
      accessControl.addToDenylist('ws', 'p2', { reason: 'r2', addedBy: 'b', auto: true })

      const list = accessControl.getDenylist('ws')
      expect(list).toHaveLength(2)
      expect(list.find((e) => e.peerId === 'p1')!.entry.reason).toBe('r1')
    })

    it('should return allowlist entries', () => {
      accessControl.addToAllowlist('ws', 'p1', { addedBy: 'a', label: 'Alice' })

      const list = accessControl.getAllowlist('ws')
      expect(list).toHaveLength(1)
      expect(list[0].entry.label).toBe('Alice')
    })

    it('should return global denylist', () => {
      accessControl.addToGlobalDenylist('p1', { reason: 'bad', addedBy: 'sys', auto: true })

      const list = accessControl.getGlobalDenylist()
      expect(list).toHaveLength(1)
      expect(list[0].peerId).toBe('p1')
    })
  })

  describe('persistence', () => {
    it('should export config', () => {
      accessControl.setAllowlistMode('ws', true)
      accessControl.addToAllowlist('ws', 'p1', { addedBy: 'admin' })
      accessControl.addToDenylist('ws', 'p2', { reason: 'bad', addedBy: 'admin', auto: false })

      const exported = accessControl.exportConfig('ws') as any
      expect(exported.workspaceId).toBe('ws')
      expect(exported.allowlistEnabled).toBe(true)
      expect(exported.allowlist).toHaveLength(1)
      expect(exported.denylist).toHaveLength(1)
    })

    it('should import config', () => {
      const data = {
        workspaceId: 'imported-ws',
        allowlistEnabled: true,
        allowlist: [['peer1', { addedAt: Date.now(), addedBy: 'admin', label: 'Test' }]],
        denylist: [['bad1', { addedAt: Date.now(), reason: 'evil', addedBy: 'sys', auto: true }]],
        ipDenylist: []
      }

      accessControl.importConfig(data as any)

      expect(accessControl.canAccess('imported-ws', 'peer1').allowed).toBe(true)
      expect(accessControl.canAccess('imported-ws', 'stranger').allowed).toBe(false)
      expect(accessControl.canAccess('imported-ws', 'bad1').allowed).toBe(false)
    })

    it('should return empty object for unknown workspace', () => {
      expect(accessControl.exportConfig('unknown')).toEqual({})
    })

    it('should skip import without workspaceId', () => {
      accessControl.importConfig({} as any)
      // Should not throw
    })
  })
})
