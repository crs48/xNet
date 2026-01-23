/**
 * ConsentManager - manages user telemetry consent preferences.
 *
 * Emits events on consent changes, persists to storage,
 * and provides tier-checking methods.
 */

import type { TelemetryTier, TelemetryConsent } from './types'
import { DEFAULT_CONSENT, tierLevel, tierMeetsRequirement } from './types'
import type { ConsentStorage } from './storage'
import { MemoryConsentStorage } from './storage'

type Listener<T extends unknown[]> = (...args: T) => void

export interface ConsentManagerEvents {
  'consent-changed': [consent: TelemetryConsent]
  'tier-changed': [oldTier: TelemetryTier, newTier: TelemetryTier]
}

export interface ConsentManagerOptions {
  /** Storage adapter for persistence */
  storage?: ConsentStorage
  /** Storage key (default: 'xnet:telemetry:consent') */
  storageKey?: string
  /** Auto-load from storage on construction (default: true) */
  autoLoad?: boolean
}

export class ConsentManager {
  private consent: TelemetryConsent = { ...DEFAULT_CONSENT }
  private storage: ConsentStorage
  private storageKey: string
  private loaded = false
  private listeners = new Map<string, Set<Listener<unknown[]>>>()

  constructor(options: ConsentManagerOptions = {}) {
    this.storage = options.storage ?? new MemoryConsentStorage()
    this.storageKey = options.storageKey ?? 'xnet:telemetry:consent'

    if (options.autoLoad !== false) {
      // Fire-and-forget initial load
      this.load().catch(() => {
        /* silent - consent stays at default */
      })
    }
  }

  /** Current consent (readonly snapshot) */
  get current(): Readonly<TelemetryConsent> {
    return this.consent
  }

  /** Current tier shorthand */
  get tier(): TelemetryTier {
    return this.consent.tier
  }

  /** Whether any telemetry is enabled */
  get isEnabled(): boolean {
    return this.consent.tier !== 'off'
  }

  /** Whether sharing (beyond local) is enabled */
  get isSharingEnabled(): boolean {
    return tierLevel(this.consent.tier) >= tierLevel('crashes')
  }

  /** Whether consent has been loaded from storage */
  get isLoaded(): boolean {
    return this.loaded
  }

  /** Check if current tier meets a required tier */
  allowsTier(requiredTier: TelemetryTier): boolean {
    if (this.isExpired()) return false
    return tierMeetsRequirement(this.consent.tier, requiredTier)
  }

  /** Check if a specific schema is allowed */
  allowsSchema(schemaIRI: string): boolean {
    if (!this.isEnabled) return false
    if (this.isExpired()) return false
    // Empty enabledSchemas means "all schemas allowed by tier"
    if (this.consent.enabledSchemas.length === 0) return true
    return this.consent.enabledSchemas.includes(schemaIRI)
  }

  /** Update consent preferences */
  async setConsent(updates: Partial<TelemetryConsent>): Promise<void> {
    const oldTier = this.consent.tier
    this.consent = {
      ...this.consent,
      ...updates,
      grantedAt: updates.grantedAt ?? new Date()
    }
    await this.persist()

    this.emit('consent-changed', this.consent)
    if (updates.tier && updates.tier !== oldTier) {
      this.emit('tier-changed', oldTier, updates.tier)
    }
  }

  /** Shorthand to update just the tier */
  async setTier(tier: TelemetryTier): Promise<void> {
    await this.setConsent({ tier })
  }

  /** Reset to defaults (opt-out) */
  async reset(): Promise<void> {
    const oldTier = this.consent.tier
    this.consent = { ...DEFAULT_CONSENT, grantedAt: new Date() }
    await this.persist()
    this.emit('consent-changed', this.consent)
    if (oldTier !== 'off') {
      this.emit('tier-changed', oldTier, 'off')
    }
  }

  /** Load consent from storage */
  async load(): Promise<void> {
    const stored = await this.storage.get(this.storageKey)
    if (stored) {
      // Check if expired
      if (stored.expiresAt && new Date(stored.expiresAt) < new Date()) {
        // Expired - reset to off
        this.consent = { ...DEFAULT_CONSENT, grantedAt: new Date() }
        await this.persist()
      } else {
        this.consent = stored
      }
    }
    this.loaded = true
  }

  /** Subscribe to events */
  on<E extends keyof ConsentManagerEvents>(
    event: E,
    listener: (...args: ConsentManagerEvents[E]) => void
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener as Listener<unknown[]>)
    return this
  }

  /** Unsubscribe from events */
  off<E extends keyof ConsentManagerEvents>(
    event: E,
    listener: (...args: ConsentManagerEvents[E]) => void
  ): this {
    this.listeners.get(event)?.delete(listener as Listener<unknown[]>)
    return this
  }

  private emit<E extends keyof ConsentManagerEvents>(
    event: E,
    ...args: ConsentManagerEvents[E]
  ): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args)
      } catch {
        /* listener errors don't break the manager */
      }
    })
  }

  private async persist(): Promise<void> {
    await this.storage.set(this.storageKey, this.consent)
  }

  private isExpired(): boolean {
    if (!this.consent.expiresAt) return false
    return new Date(this.consent.expiresAt) < new Date()
  }
}
