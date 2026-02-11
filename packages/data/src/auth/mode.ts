/**
 * Authorization mode helpers for schema compatibility.
 */

import type { Schema } from '../schema/types'

export type AuthMode = 'legacy' | 'compat' | 'enforce'

/**
 * Determine authorization mode for a schema.
 */
export function getAuthMode(schema: Schema): AuthMode {
  if (!schema.authorization) return 'legacy'
  return 'enforce'
}

/**
 * Warn developers when a schema has no authorization block.
 */
export function warnLegacySchema(schema: Schema): void {
  if (!schema.authorization) {
    console.warn(
      `[xnet:auth] Schema '${schema.name}' has no authorization block - ` +
        `data will be owner-only in legacy mode. Add an 'authorization' block to enable explicit access control.`
    )
  }
}
