import { describe, expect, it, vi } from 'vitest'
import { GrantExpirationCleaner } from './grant-expiration-cleaner'

describe('GrantExpirationCleaner', () => {
  it('should prune only expired active grants', async () => {
    const now = 1000000
    const list = vi.fn(async () => [
      {
        id: 'expired-active',
        properties: { expiresAt: now - 120000, revokedAt: 0 }
      },
      {
        id: 'still-valid',
        properties: { expiresAt: now + 120000, revokedAt: 0 }
      },
      {
        id: 'already-revoked',
        properties: { expiresAt: now - 120000, revokedAt: now - 500000 }
      }
    ])
    const update = vi.fn(async () => undefined)

    const cleaner = new GrantExpirationCleaner(
      {
        list,
        update
      },
      {
        clock: () => now
      }
    )

    const result = await cleaner.cleanup()

    expect(result.pruned).toBe(1)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenNthCalledWith(
      1,
      'expired-active',
      expect.objectContaining({ properties: expect.any(Object) })
    )
  })

  it('should apply 60-second skew tolerance by default', async () => {
    const now = 2000000
    const withinTolerance = now - 30000
    const beyondTolerance = now - 61000
    const update = vi.fn(async () => undefined)

    const cleaner = new GrantExpirationCleaner(
      {
        list: async () => [
          { id: 'within', properties: { expiresAt: withinTolerance, revokedAt: 0 } },
          { id: 'beyond', properties: { expiresAt: beyondTolerance, revokedAt: 0 } }
        ],
        update
      },
      {
        clock: () => now
      }
    )

    const result = await cleaner.cleanup()

    expect(result.pruned).toBe(1)
    expect(update).toHaveBeenCalledWith('beyond', {
      properties: {
        revokedAt: now - 60000,
        revokedBy: 'SYSTEM'
      }
    })
  })
})
