/**
 * @xnetjs/plugins — SSRF guard for outbound actions (exploration 0213).
 *
 * Outbound actions POST to URLs that may be user-configured (a generic
 * webhook-out target). Even when the host is "allowlisted" (the action derived
 * its `network` grant from the configured URL), a user could point it at an
 * internal target — `http://169.254.169.254/` (cloud metadata), `localhost`, a
 * private RFC-1918 range — to exfiltrate credentials or reach internal
 * services. {@link assertPublicUrl} rejects those before the request leaves.
 *
 * The literal-host check itself lives in `@xnetjs/core`; this module keeps the
 * action-specific {@link ActionSsrfError} contract that callers/tests depend on.
 */

import { validateExternalUrl } from '@xnetjs/core'

export class ActionSsrfError extends Error {
  constructor(
    message: string,
    public readonly url: string
  ) {
    super(message)
    this.name = 'ActionSsrfError'
  }
}

/**
 * Throw {@link ActionSsrfError} unless `rawUrl` is a plausibly-public HTTP(S)
 * endpoint: rejects non-http(s) schemes, localhost, `.local`/`.internal`
 * suffixes, the cloud metadata host, and private/loopback/link-local IP
 * literals (v4 and v6).
 */
export function assertPublicUrl(rawUrl: string): void {
  const result = validateExternalUrl(rawUrl)
  if (!result.valid) {
    throw new ActionSsrfError(
      result.error ?? `outbound action URL targets a non-public host: ${rawUrl}`,
      rawUrl
    )
  }
}
