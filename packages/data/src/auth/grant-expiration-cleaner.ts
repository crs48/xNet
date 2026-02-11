import { GRANT_SCHEMA_IRI } from './grants'

export interface GrantExpirationStore {
  list(options?: { schemaId?: string; includeDeleted?: boolean }): Promise<
    Array<{
      id: string
      properties: Record<string, unknown>
    }>
  >
  update(nodeId: string, options: { properties: Record<string, unknown> }): Promise<unknown>
}

export interface GrantExpirationCleanerOptions {
  clock?: () => number
  cleanupIntervalMs?: number
  clockSkewToleranceMs?: number
  systemRevoker?: string
}

export class GrantExpirationCleaner {
  static readonly DEFAULT_CLOCK_SKEW_TOLERANCE_MS = 60_000
  static readonly DEFAULT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

  private readonly clock: () => number
  private readonly cleanupIntervalMs: number
  private readonly clockSkewToleranceMs: number
  private readonly systemRevoker: string
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly store: GrantExpirationStore,
    options: GrantExpirationCleanerOptions = {}
  ) {
    this.clock = options.clock ?? Date.now
    this.cleanupIntervalMs =
      options.cleanupIntervalMs ?? GrantExpirationCleaner.DEFAULT_CLEANUP_INTERVAL_MS
    this.clockSkewToleranceMs =
      options.clockSkewToleranceMs ?? GrantExpirationCleaner.DEFAULT_CLOCK_SKEW_TOLERANCE_MS
    this.systemRevoker = options.systemRevoker ?? 'SYSTEM'
  }

  start(): void {
    if (this.timer) {
      return
    }

    this.timer = setInterval(() => {
      void this.cleanup()
    }, this.cleanupIntervalMs)
  }

  stop(): void {
    if (!this.timer) {
      return
    }

    clearInterval(this.timer)
    this.timer = null
  }

  async cleanup(): Promise<{ pruned: number }> {
    const now = this.clock() - this.clockSkewToleranceMs
    const grants = await this.store.list({
      schemaId: GRANT_SCHEMA_IRI,
      includeDeleted: false
    })

    let pruned = 0
    for (const grant of grants) {
      const expiresAt = asNumber(grant.properties.expiresAt)
      const revokedAt = asNumber(grant.properties.revokedAt)
      if (revokedAt > 0) {
        continue
      }

      if (expiresAt > 0 && expiresAt < now) {
        await this.store.update(grant.id, {
          properties: {
            revokedAt: now,
            revokedBy: this.systemRevoker
          }
        })
        pruned += 1
      }
    }

    return { pruned }
  }
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
