/**
 * Consent storage adapters.
 */

import type { TelemetryConsent } from './types'

/** Abstract storage interface for consent persistence */
export interface ConsentStorage {
  get(key: string): Promise<TelemetryConsent | null>
  set(key: string, consent: TelemetryConsent): Promise<void>
  delete(key: string): Promise<void>
}

/** In-memory storage (for tests and SSR) */
export class MemoryConsentStorage implements ConsentStorage {
  private store = new Map<string, TelemetryConsent>()

  async get(key: string): Promise<TelemetryConsent | null> {
    return this.store.get(key) ?? null
  }

  async set(key: string, consent: TelemetryConsent): Promise<void> {
    this.store.set(key, consent)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}

/** LocalStorage-based persistence (browser) */
export class LocalStorageConsentStorage implements ConsentStorage {
  async get(key: string): Promise<TelemetryConsent | null> {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return {
        ...parsed,
        grantedAt: new Date(parsed.grantedAt),
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined
      }
    } catch {
      return null
    }
  }

  async set(key: string, consent: TelemetryConsent): Promise<void> {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(consent))
  }

  async delete(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  }
}
