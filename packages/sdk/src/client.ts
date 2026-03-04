/**
 * createClient - Unified client initialization with telemetry.
 *
 * Provides a single entry point for initializing an xNet client identity,
 * with optional telemetry for tracking initialization success/failure.
 *
 * @example
 * const client = await createClient({ privateKey: myKey, telemetry })
 * const client = await createClient({ telemetry }) // generates a new identity
 */

import type { Identity } from '@xnetjs/identity'
import { generateIdentity, identityFromPrivateKey } from '@xnetjs/identity'

// ─── Telemetry Interface ──────────────────────────────────

/**
 * Optional telemetry reporter for SDK initialization.
 * Duck-typed to avoid circular dependency on @xnetjs/telemetry.
 */
export interface SdkTelemetry {
  reportUsage(metricName: string, value: number): void
  reportCrash(error: Error, context?: Record<string, unknown>): void
}

// ─── Client ──────────────────────────────────────────────

/**
 * An initialized xNet client with identity information.
 */
export interface XNetClient {
  /** DID identifier for this client */
  did: string
  /** The full identity object */
  identity: Identity
  /** The private key (keep secure!) */
  privateKey: Uint8Array
}

/**
 * Options for creating an xNet client.
 */
export interface CreateClientOptions {
  /**
   * Existing private key to use. If omitted, a new identity is generated.
   */
  privateKey?: Uint8Array
  /**
   * Optional telemetry reporter for tracking initialization success/failure.
   */
  telemetry?: SdkTelemetry
}

/**
 * Initialize an xNet client.
 *
 * Creates or restores a client identity. If `privateKey` is provided, the
 * existing identity is restored. Otherwise, a new identity is generated.
 *
 * Tracks initialization success and failure via telemetry when provided.
 *
 * @example
 * // New client
 * const client = await createClient({ telemetry })
 *
 * // Restore existing client
 * const client = await createClient({ privateKey: storedKey, telemetry })
 */
export async function createClient(options: CreateClientOptions = {}): Promise<XNetClient> {
  const { privateKey: existingKey, telemetry } = options

  try {
    let identity: Identity
    let privateKey: Uint8Array

    if (existingKey) {
      // Restore existing identity
      identity = identityFromPrivateKey(existingKey)
      privateKey = existingKey
      telemetry?.reportUsage('sdk.client_restore', 1)
    } else {
      // Generate new identity
      const result = generateIdentity()
      identity = result.identity
      privateKey = result.privateKey
      telemetry?.reportUsage('sdk.client_create', 1)
    }

    telemetry?.reportUsage('sdk.client_init_success', 1)

    return { did: identity.did, identity, privateKey }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    telemetry?.reportUsage('sdk.client_init_failure', 1)
    telemetry?.reportCrash(error, {
      codeNamespace: 'sdk.createClient',
      operation: existingKey ? 'restore' : 'create'
    })
    throw err
  }
}
