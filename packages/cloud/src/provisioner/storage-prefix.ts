/**
 * @xnetjs/cloud/provisioner — the object-store prefix one tenant owns.
 *
 * Every tenant byte in R2 — the Litestream replica, blobs, backups — lives
 * under `t/<tenantId>/`. That was previously a string literal repeated at each
 * call site, which is fine right up until a scoped credential permits one prefix
 * and the hub writes to another: the failure then looks like an outage rather
 * than a config mistake (exploration 0436).
 */

/** The single R2 prefix a tenant's bytes live under. Always ends in `/`. */
export function tenantStoragePrefix(tenantId: string): string {
  return `t/${tenantId}/`
}

/** R2 object path holding a tenant's SQLite replica. */
export function tenantReplicaKey(tenantId: string): string {
  return `${tenantStoragePrefix(tenantId)}db`
}
