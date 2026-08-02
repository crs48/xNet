/**
 * xNet Cloud — prefix-scoped R2 credentials (exploration 0436, Phase S).
 *
 * Every managed hub used to receive the same bucket-wide R2 access key, so any
 * code running in any tenant container could read every other tenant's SQLite
 * replica under `t/<other>/db`. The `t/<tenantId>/` layout was a naming
 * convention, never a boundary.
 *
 * Cloudflare ships the primitive that makes it one:
 * `POST /accounts/{account_id}/r2/temp-access-credentials` returns S3
 * credentials bound to one bucket, one permission set, and a list of prefixes.
 * A hub then holds a credential worth exactly one tenant's bytes.
 *
 * Credentials are short-lived by design and refreshed on `setEnv` — the path a
 * plan change, seat change or dunning flip already travels.
 */

import { tenantStoragePrefix, type TenantR2Credentials } from '@xnetjs/cloud/provisioner'

/** How long a minted credential is valid. Cloudflare accepts 60s … 604800s. */
export const R2_CREDENTIAL_TTL_SECONDS = 7 * 24 * 60 * 60

export interface R2CredentialMinterConfig {
  accountId: string
  bucket: string
  /** An R2 API token with `object-read-write` on the bucket; the parent of every derived credential. */
  parentAccessKeyId: string
  apiToken: string
  ttlSeconds?: number
  /** Injected for tests. */
  fetchImpl?: typeof fetch
}

interface TempCredentialResponse {
  success?: boolean
  errors?: Array<{ message?: string }>
  result?: {
    accessKeyId?: string
    secretAccessKey?: string
    sessionToken?: string
  }
}

/**
 * Build the minter, or undefined when Cloudflare API credentials are absent.
 *
 * Undefined is a real answer, not a silent downgrade: the provisioner falls back
 * to the fleet-wide pair, which is correct for a single-tenant dev deployment.
 * What must never happen is a *failed* mint being papered over with the
 * fleet-wide key — see the throw in {@link mintScopedCredentials}.
 */
export function r2CredentialMinterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): ((tenantId: string) => Promise<TenantR2Credentials>) | undefined {
  const accountId = env.R2_ACCOUNT_ID
  const bucket = env.R2_BUCKET
  const parentAccessKeyId = env.R2_ACCESS_KEY_ID
  const apiToken = env.CLOUDFLARE_API_TOKEN
  if (!accountId || !bucket || !parentAccessKeyId || !apiToken) return undefined
  const config: R2CredentialMinterConfig = {
    accountId,
    bucket,
    parentAccessKeyId,
    apiToken,
    fetchImpl,
    ...(env.R2_CREDENTIAL_TTL_SECONDS ? { ttlSeconds: Number(env.R2_CREDENTIAL_TTL_SECONDS) } : {})
  }
  return (tenantId: string) => mintScopedCredentials(config, tenantId)
}

/**
 * Mint credentials scoped to one tenant's prefix.
 *
 * Throws on any failure rather than returning the fleet-wide key. A hub that
 * cannot be given a scoped credential must fail to provision — "absent" and
 * "unreadable" have to stay different values, and quietly handing out the
 * bucket-wide key would recreate the exact defect this module exists to close.
 */
export async function mintScopedCredentials(
  config: R2CredentialMinterConfig,
  tenantId: string
): Promise<TenantR2Credentials> {
  const doFetch = config.fetchImpl ?? fetch
  const prefix = tenantStoragePrefix(tenantId)
  const res = await doFetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/r2/temp-access-credentials`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        bucket: config.bucket,
        parentAccessKeyId: config.parentAccessKeyId,
        permission: 'object-read-write',
        prefixes: [prefix],
        ttlSeconds: config.ttlSeconds ?? R2_CREDENTIAL_TTL_SECONDS
      })
    }
  )
  if (!res.ok) {
    throw new Error(`R2 credential mint failed for ${tenantId}: HTTP ${res.status}`)
  }
  const body = (await res.json()) as TempCredentialResponse
  const result = body.result
  if (!body.success || !result?.accessKeyId || !result.secretAccessKey) {
    const reason = body.errors?.map((e) => e.message).join('; ') || 'no credentials returned'
    throw new Error(`R2 credential mint failed for ${tenantId}: ${reason}`)
  }
  return {
    accessKeyId: result.accessKeyId,
    secretAccessKey: result.secretAccessKey,
    ...(result.sessionToken ? { sessionToken: result.sessionToken } : {})
  }
}
