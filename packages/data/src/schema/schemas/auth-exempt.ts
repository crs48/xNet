/**
 * Schemas that intentionally carry no `authorization` block (exploration 0192).
 *
 * Every other registered schema must declare authorization (enforced by
 * `authorization-coverage.test.ts`). The schemas listed here are edge/system/
 * identity nodes whose access semantics deliberately differ from the Space
 * cascade and are governed elsewhere (the hub grant model, signed-content
 * federation, or per-user privacy):
 *
 * - `SpaceMembership` — an edge node; who may read/write a membership is the
 *   membership *admin* question, secured by the hub against the parent Space,
 *   not a cascade of the membership row itself.
 * - `Grant` — the capability record that the grant model is *made of*; gating
 *   it with the grant model would be circular. Hub-managed.
 * - `Profile` — public identity. Profiles must be readable by collaborators to
 *   render names/handles on shared content, so they are hub-published rather
 *   than Space-gated.
 * - `SchemaDefinition` / `SchemaCompatibility` / `SyncPolicy` — system /
 *   federation nodes; signed and content-addressed, governed by the schema
 *   authority resolution path, not per-node roles.
 * - `PresenceSummary` — ephemeral presence aggregate; visibility is handled by
 *   the presence pipeline.
 * - `AccountRecord` / `DeviceRecord` / `RecoveryRecord` / `RevocationRecord` — the
 *   account/device ledger (explorations 0149/0243). Write access is "is the signer an
 *   active controller of this account at the current epoch", enforced by the
 *   signed-ledger / hub layer, not a per-node role cascade. Reads mirror across a
 *   user's own devices and hubs.
 *
 * This is the single source of truth: `defineSchema` reads it to suppress the
 * dev-time legacy warning, and the coverage test reads it to allow these IRIs.
 * Both the versioned (canonical) and unversioned (legacy alias) IRIs are listed
 * so the check matches however a schema id is resolved.
 */
export const AUTH_EXEMPT_SCHEMA_IRIS: ReadonlySet<string> = new Set<string>([
  'xnet://xnet.fyi/SpaceMembership@1.0.0',
  'xnet://xnet.fyi/SpaceMembership',
  'xnet://xnet.fyi/Grant@1.0.0',
  'xnet://xnet.fyi/Grant',
  'xnet://xnet.fyi/Profile@1.0.0',
  'xnet://xnet.fyi/Profile',
  'xnet://xnet.fyi/SchemaDefinition@1.0.0',
  'xnet://xnet.fyi/SchemaDefinition',
  'xnet://xnet.fyi/SchemaCompatibility@1.0.0',
  'xnet://xnet.fyi/SchemaCompatibility',
  'xnet://xnet.fyi/SyncPolicy@1.0.0',
  'xnet://xnet.fyi/SyncPolicy',
  'xnet://xnet.fyi/PresenceSummary@1.0.0',
  'xnet://xnet.fyi/PresenceSummary',
  // Account/device ledger (0149/0243) — controller-signed + epoch-gated, hub-enforced.
  'xnet://xnet.fyi/AccountRecord@1.0.0',
  'xnet://xnet.fyi/AccountRecord',
  'xnet://xnet.fyi/DeviceRecord@1.0.0',
  'xnet://xnet.fyi/DeviceRecord',
  'xnet://xnet.fyi/RecoveryRecord@1.0.0',
  'xnet://xnet.fyi/RecoveryRecord',
  'xnet://xnet.fyi/RevocationRecord@1.0.0',
  'xnet://xnet.fyi/RevocationRecord'
])

/** Whether a schema id is on the intentional authorization-exempt allowlist. */
export function isAuthExemptSchema(schemaId: string): boolean {
  return AUTH_EXEMPT_SCHEMA_IRIS.has(schemaId)
}
