# @xnetjs/abuse

Composable abuse, moderation, and reach policy decisions for xNet.

> **Alpha software.** xNet is released but early: this package is on npm and
> usable today, but its API can change between releases, sometimes without a
> migration path. Pin your version. See the
> [project README](https://github.com/crs48/xNet#readme) for what alpha means here.

This package is intentionally dependency-light so lower-level packages such as
`@xnetjs/sync`, `@xnetjs/network`, and `@xnetjs/hub` can adopt the decision types
without depending on `@xnetjs/data`.

## Core Idea

Adapters gather facts. Pure functions make decisions.

```typescript
import { decidePublicInteraction } from '@xnetjs/abuse'

const decision = decidePublicInteraction({
  actor: { firstContact: true },
  labels: [{ value: 'spam', confidence: 0.6, sourceWeight: 1, sourceDID: 'did:key:z...' }],
  quality: { slopScore: 0.4 }
})

console.log(decision.admission) // "quarantine"
```

## Current Scope

- Shared decision/result types
- Deterministic reason codes
- Pure decision helpers for transport, remote mutation, public interaction, and reach
- Adapter helpers under `@xnetjs/abuse/adapters`
- Explanation helpers for UI/devtools/audit surfaces
- Fixtures for tests and future package adapters

## Adapter Entry Point

Protocol packages should keep their local verification, rate-limit, and scoring code local,
then adapt the result into shared abuse facts:

```typescript
import { createRemoteAdmissionPipeline } from '@xnetjs/abuse/adapters'

const pipeline = createRemoteAdmissionPipeline({
  adapt: (event: { signatureValid: boolean; overSizeLimit: boolean; peerScore: number }) => ({
    surface: 'remoteMutation',
    crypto: {
      signatureValid: event.signatureValid
    },
    resource: {
      overSizeLimit: event.overSizeLimit
    },
    actor: {
      peerScore: event.peerScore
    }
  })
})

const result = pipeline.evaluate({
  signatureValid: false,
  overSizeLimit: false,
  peerScore: 100
})

console.log(result.shouldMutate) // false
```

Signed moderation schemas live in future `@xnetjs/data` work so this package can stay
safe for lower-level imports.
