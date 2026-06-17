# @xnetjs/trust

The shared provenance→trust-tier primitives for xNet's extensibility systems
(exploration 0194).

Trust follows **provenance** — where an extension came from — never anything the
code declares about itself. A `synced` extension always re-derives its tier
locally (sync is not consent).

```ts
import { deriveTrustTier, requiresCapabilityReprompt, sandboxForTier } from '@xnetjs/trust'

deriveTrustTier('marketplace') // 'marketplace'  → sandboxForTier → 'iframe'
deriveTrustTier('authored') //    'user'         → 'ses-worker'
deriveTrustTier('builtin') //     'first-party'  → 'host'
requiresCapabilityReprompt('synced') // true
```

This package is the single source of truth consumed by `@xnetjs/plugins`
(ecosystem layer, 0192) and `@xnetjs/labs` (0180), which previously carried
byte-for-byte identical copies of this logic. It is intentionally zero-dependency
and policy-only (no runtime) so it never becomes a coupling magnet.
