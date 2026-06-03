import {
  createPolicyBlockList,
  signPolicyBlockList,
  verifySignedPolicyBlockList
} from '@xnetjs/abuse'
import { generateIdentity } from '@xnetjs/identity'
import { YjsPeerScorer } from '@xnetjs/sync'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoBlocker } from '../src/security/auto-blocker'
import { DefaultConnectionGater } from '../src/security/gater'
import { DEFAULT_LIMITS } from '../src/security/limits'
import { configureSecurityLogger } from '../src/security/logging'
import { PeerScorer } from '../src/security/peer-scorer'

describe('AutoBlocker', () => {
  let gater: DefaultConnectionGater
  let blocker: AutoBlocker

  beforeEach(() => {
    vi.useFakeTimers()
    configureSecurityLogger({ console: false })
    gater = new DefaultConnectionGater(DEFAULT_LIMITS)
    blocker = new AutoBlocker(gater)
  })

  afterEach(() => {
    blocker.destroy()
    gater.destroy()
    vi.useRealTimers()
  })

  describe('recordEvent', () => {
    it('should not block below threshold', () => {
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(false)
    })

    it('should block after threshold exceeded', () => {
      // invalid_signature threshold: 3 in 60s
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')

      expect(blocker.isBlocked('peer1')).toBe(true)
    })

    it('should respect time window', () => {
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')

      // Move past the window
      vi.advanceTimersByTime(61_000)

      // Third event doesn't trigger (first two expired)
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(false)
    })

    it('should skip if already blocked', () => {
      blocker.blockPeer('peer1', { reason: 'test' })

      // Should not throw or create duplicate entries
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(true)
    })

    it('should use different thresholds per event type', () => {
      // rate_limit_exceeded needs 10 events
      for (let i = 0; i < 9; i++) {
        blocker.recordEvent('peer1', 'rate_limit_exceeded')
      }
      expect(blocker.isBlocked('peer1')).toBe(false)

      blocker.recordEvent('peer1', 'rate_limit_exceeded')
      expect(blocker.isBlocked('peer1')).toBe(true)
    })
  })

  describe('blockPeer', () => {
    it('should block with duration', () => {
      blocker.blockPeer('peer1', { reason: 'test', duration: 60_000 })
      expect(blocker.isBlocked('peer1')).toBe(true)

      vi.advanceTimersByTime(61_000)
      expect(blocker.isBlocked('peer1')).toBe(false)
    })

    it('should block permanently without duration', () => {
      blocker.blockPeer('peer1', { reason: 'test' })
      vi.advanceTimersByTime(365 * 24 * 60 * 60_000) // 1 year
      expect(blocker.isBlocked('peer1')).toBe(true)
    })

    it('should add to gater denylist', () => {
      blocker.blockPeer('peer1', { reason: 'test' })
      expect(gater.isDenylisted('peer1')).toBe(true)
    })

    it('should store block info', () => {
      blocker.blockPeer('peer1', {
        reason: 'invalid_signature',
        evidence: 'bad sig on change xyz',
        autoBlock: true
      })

      const info = blocker.getBlockInfo('peer1')
      expect(info).not.toBeNull()
      expect(info!.reason).toBe('invalid_signature')
      expect(info!.evidence).toContain('bad sig')
      expect(info!.autoBlock).toBe(true)
    })
  })

  describe('unblockPeer', () => {
    it('should unblock and remove from gater', () => {
      blocker.blockPeer('peer1', { reason: 'test' })
      blocker.unblockPeer('peer1')

      expect(blocker.isBlocked('peer1')).toBe(false)
      expect(gater.isDenylisted('peer1')).toBe(false)
    })

    it('should clear event history', () => {
      // Accumulate some events
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.blockPeer('peer1', { reason: 'test' })
      blocker.unblockPeer('peer1')

      // Events should be cleared, so 1 more shouldn't trigger
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(false)
    })
  })

  describe('getBlockedPeers', () => {
    it('should return all blocked peers', () => {
      blocker.blockPeer('peer1', { reason: 'a', autoBlock: true })
      blocker.blockPeer('peer2', { reason: 'b', autoBlock: false })

      const blocked = blocker.getBlockedPeers()
      expect(blocked).toHaveLength(2)
      expect(blocked.map((b) => b.peerId)).toContain('peer1')
      expect(blocked.map((b) => b.peerId)).toContain('peer2')
    })

    it('should exclude expired blocks', () => {
      blocker.blockPeer('peer1', { reason: 'test', duration: 1000 })
      vi.advanceTimersByTime(1001)

      expect(blocker.getBlockedPeers()).toHaveLength(0)
    })
  })

  describe('policy block list persistence', () => {
    it('exports active blocks as signable policy data', () => {
      const issuer = generateIdentity()
      blocker.blockPeer('peer1', {
        reason: 'manual workspace block',
        evidence: 'operator review',
        duration: 60_000,
        autoBlock: false
      })

      const policy = blocker.toPolicyBlockList({
        id: 'workspace-blocks',
        title: 'Workspace blocks',
        scope: 'workspace',
        issuerDID: issuer.identity.did
      })
      const signed = signPolicyBlockList(policy, issuer.privateKey)

      expect(policy.entries).toEqual([
        expect.objectContaining({
          subject: 'peer1',
          subjectType: 'peerId',
          action: 'block-peer',
          reason: 'manual workspace block',
          evidenceRefs: ['operator review'],
          autoBlock: false
        })
      ])
      expect(verifySignedPolicyBlockList(signed)).toEqual({ valid: true, errors: [] })
    })

    it('applies active peer blocks from persisted policy data', () => {
      const policy = createPolicyBlockList({
        id: 'local-blocks',
        scope: 'user',
        issuerDID: 'did:key:z6MkLocal',
        createdAt: 1_000,
        entries: [
          {
            subject: 'persisted-peer',
            subjectType: 'peerId',
            action: 'block-peer',
            reason: 'persisted local block',
            evidenceRefs: ['local review'],
            createdAt: 1_000,
            expiresAt: 2_000
          }
        ]
      })

      vi.setSystemTime(1_500)
      const applied = blocker.applyPolicyBlockList(policy, 1_500)

      expect(applied).toBe(1)
      expect(blocker.isBlocked('persisted-peer')).toBe(true)
      expect(blocker.getBlockInfo('persisted-peer')).toEqual(
        expect.objectContaining({
          reason: 'persisted local block',
          evidence: 'local review'
        })
      )

      vi.advanceTimersByTime(501)
      expect(blocker.isBlocked('persisted-peer')).toBe(false)
    })

    it('does not apply tampered signed policy data', () => {
      const issuer = generateIdentity()
      const signed = signPolicyBlockList(
        createPolicyBlockList({
          id: 'workspace-blocks',
          scope: 'workspace',
          issuerDID: issuer.identity.did,
          createdAt: 1_000,
          entries: [
            {
              subject: 'trusted-peer',
              subjectType: 'peerId',
              action: 'block-peer',
              reason: 'signed block',
              createdAt: 1_000
            }
          ]
        }),
        issuer.privateKey
      )
      const tampered = {
        ...signed,
        entries: [{ ...signed.entries[0], subject: 'tampered-peer' }]
      }

      const applied = blocker.applyPolicyBlockList(tampered, 1_500)

      expect(applied).toBe(0)
      expect(blocker.isBlocked('tampered-peer')).toBe(false)
    })

    it('ignores expired or non-peer policy entries', () => {
      const policy = createPolicyBlockList({
        id: 'workspace-blocks',
        scope: 'workspace',
        issuerDID: 'did:key:z6MkWorkspace',
        createdAt: 1_000,
        entries: [
          {
            subject: 'expired-peer',
            subjectType: 'peerId',
            action: 'block-peer',
            reason: 'expired',
            createdAt: 1_000,
            expiresAt: 1_200
          },
          {
            subject: 'did:key:z6MkUser',
            subjectType: 'did',
            action: 'reject',
            reason: 'handled by higher policy layer',
            createdAt: 1_000
          }
        ]
      })

      const applied = blocker.applyPolicyBlockList(policy, 1_500)

      expect(applied).toBe(0)
      expect(blocker.isBlocked('expired-peer')).toBe(false)
      expect(blocker.isBlocked('did:key:z6MkUser')).toBe(false)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      blocker.blockPeer('peer1', { reason: 'auto', autoBlock: true })
      blocker.blockPeer('peer2', { reason: 'manual', autoBlock: false })
      blocker.blockPeer('peer3', { reason: 'auto2', autoBlock: true })

      const stats = blocker.getStats()
      expect(stats.totalBlocked).toBe(3)
      expect(stats.autoBlocked).toBe(2)
      expect(stats.manualBlocked).toBe(1)
    })
  })

  describe('integration with PeerScorer', () => {
    it('should block when score drops below disconnect threshold', () => {
      const scorer = new PeerScorer({ decayIntervalMs: 100_000 })
      const blockerWithScorer = new AutoBlocker(gater, scorer)

      // Drive score below disconnect threshold (-50)
      scorer.recordInvalidSignature('bad-peer') // -50
      scorer.recordSyncFailure('bad-peer') // -2 more

      expect(blockerWithScorer.isBlocked('bad-peer')).toBe(true)

      scorer.destroy()
      blockerWithScorer.destroy()
    })
  })

  describe('integration with YjsPeerScorer', () => {
    it('blocks when Yjs scorer returns a block action', () => {
      const yjsScorer = new YjsPeerScorer()
      const blockerWithYjsScorer = new AutoBlocker(gater, undefined, {
        yjsPeerScorer: yjsScorer,
        yjsBlockDuration: 30_000
      })

      yjsScorer.penalize('bad-yjs-peer', 'invalidSignature')
      yjsScorer.penalize('bad-yjs-peer', 'invalidSignature')
      yjsScorer.penalize('bad-yjs-peer', 'invalidSignature')

      expect(blockerWithYjsScorer.isBlocked('bad-yjs-peer')).toBe(true)
      expect(blockerWithYjsScorer.getBlockInfo('bad-yjs-peer')).toEqual(
        expect.objectContaining({
          reason: 'yjs_invalidSignature',
          autoBlock: true
        })
      )

      vi.advanceTimersByTime(30_001)
      expect(blockerWithYjsScorer.isBlocked('bad-yjs-peer')).toBe(false)

      blockerWithYjsScorer.destroy()
    })

    it('detaches Yjs scorer listener on destroy', () => {
      const yjsScorer = new YjsPeerScorer({ instantBlockAfter: 1 })
      const blockerWithYjsScorer = new AutoBlocker(gater, undefined, {
        yjsPeerScorer: yjsScorer
      })

      blockerWithYjsScorer.destroy()
      yjsScorer.penalize('detached-peer', 'invalidSignature')

      expect(blockerWithYjsScorer.isBlocked('detached-peer')).toBe(false)
    })
  })

  describe('custom thresholds', () => {
    it('should accept custom thresholds', () => {
      const customBlocker = new AutoBlocker(gater, undefined, {
        thresholds: {
          invalid_signature: { count: 1, window: 60_000, duration: 60_000 }
        }
      })

      // Single event should trigger with custom threshold
      customBlocker.recordEvent('peer1', 'invalid_signature')
      expect(customBlocker.isBlocked('peer1')).toBe(true)

      customBlocker.destroy()
    })
  })
})
