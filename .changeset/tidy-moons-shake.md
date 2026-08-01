---
'@xnetjs/runtime': minor
'@xnetjs/react': minor
'@xnetjs/data': minor
---

Resolve a hub's address from a stable name instead of hard-coding its URL.

A managed hub's URL belongs to whoever hosts it today, so moving it between
regions or substrates silently misconfigured every device that had stored it.
`XNetConfig.hubAddress` now takes a name and a resolver: the client resolves
once, caches the answer, and connects to the hub **directly** — nothing proxies
your traffic. `hubUrl` still works unchanged and is used as the fallback until
resolution succeeds, so a resolver outage costs freshness, never reachability.

- `@xnetjs/runtime` adds `resolveHubUrl`, `httpResolver`, and the
  `HubAddressRecord` types. Records are signed by the hub itself, so a resolver
  can cache one but cannot change where you connect.
- `@xnetjs/react` adds `useResolvedHubUrl` and the `hubAddress` config option.
  A hub that is waking from cold now reports as waking, with a retry hint,
  instead of looking like an outage.
- `@xnetjs/data` records the last-known hub address inside `.xnetpack`
  manifests, under the signature, so an export on its own is enough to
  reconnect.

All three additions are additive; existing configuration and bundles are
unaffected.
