/**
 * @xnetjs/hub - URL validation and SSRF protection utilities.
 *
 * The SSRF guard lives in @xnetjs/core so the hub, plugins, and any future
 * consumer share one literal-host implementation. This previously carried a
 * regex-based copy that missed several private ranges (CGNAT 100.64/10,
 * IPv4-mapped IPv6, NAT64, fe81::–fe8f:: link-local, the trailing-dot bypass)
 * and false-positived on hosts like `fd-startup.com`.
 */
export { validateExternalUrl } from '@xnetjs/core'
