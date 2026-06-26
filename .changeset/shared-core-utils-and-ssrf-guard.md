---
'@xnetjs/core': minor
'@xnetjs/plugins': patch
'@xnetjs/react': patch
---

Add shared dependency-free helpers to `@xnetjs/core` and unify the SSRF guard.

`@xnetjs/core` now exports `clamp`, `clamp01`, `formatBytes`, and the
literal-host SSRF guard (`assertPublicUrl`, `validateExternalUrl`, `SsrfError`),
replacing several behaviour-identical copies that had drifted across packages —
including byte formatters that silently capped at megabytes and a regex-based
URL guard that missed private ranges (CGNAT, IPv4-mapped IPv6, NAT64, the
`fe81::–fe8f::` link-local block, and the trailing-dot bypass).
`@xnetjs/plugins` now delegates its outbound-action SSRF check to the canonical
guard while keeping its `ActionSsrfError` contract; `@xnetjs/react` byte
displays no longer cap at megabytes.
