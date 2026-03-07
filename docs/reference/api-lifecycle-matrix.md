# xNet API Lifecycle Matrix

> Current package-entrypoint contract for the post-open-source convergence cycle.

## Why This Exists

The root `@xnetjs/*` packages currently expose more surface area than xNet is ready to promise as equally stable.

This matrix makes the contract explicit:

- `stable` means the entrypoint is the recommended default and should follow normal semver expectations,
- `experimental` means the entrypoint is shipped but still converging and may change more aggressively,
- `deprecated` means the entrypoint still works for compatibility but should not be used for new code,
- `internal` means the entrypoint is not part of the public contract.

Root imports remain backward-compatible for now unless otherwise noted. When a narrower subpath exists, prefer it for new code.

## New App Start Here

If you are evaluating xNet for the first time, the safest path is:

- `@xnetjs/react` for provider/bootstrap plus `useQuery`, `useMutate`, `useNode`, and `useIdentity`
- `@xnetjs/data/schema` for schema definitions and built-in schemas
- `@xnetjs/data/store` for `NodeStore` and storage adapters
- `@xnetjs/data/updates` for signed Yjs update helpers
- `@xnetjs/identity/did`, `@xnetjs/identity/key-bundle`, and `@xnetjs/identity/passkey` for identity/auth bootstrap

Treat `@xnetjs/react/database`, `@xnetjs/data/database`, `@xnetjs/data/auth`, and `@xnetjs/data-bridge` as intentionally narrower or still-converging surfaces.

## Package Summary

| Package               | Status       | Recommended entrypoints                                                                                                                     |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xnetjs/react`       | mixed        | `@xnetjs/react`, `@xnetjs/react/database`, `@xnetjs/react/experimental`, `@xnetjs/react/internal`                                           |
| `@xnetjs/data`        | mixed        | `@xnetjs/data/schema`, `@xnetjs/data/store`, `@xnetjs/data/updates`, `@xnetjs/data/awareness`, `@xnetjs/data/database`, `@xnetjs/data/auth` |
| `@xnetjs/identity`    | mixed        | `@xnetjs/identity/did`, `@xnetjs/identity/ucan`, `@xnetjs/identity/key-bundle`, `@xnetjs/identity/passkey`, `@xnetjs/identity/legacy`       |
| `@xnetjs/data-bridge` | experimental | `@xnetjs/data-bridge`, `@xnetjs/data-bridge/worker`, `@xnetjs/data-bridge/native`, `@xnetjs/data-bridge/types`                              |

## `@xnetjs/react`

| Entrypoint                   | Status       | Contract                                                                                                                                                          |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xnetjs/react`              | stable       | Provider/bootstrap plus the core hook contract: `XNetProvider`, `useXNet`, `useQuery`, `useMutate`, `useNode`, `useIdentity`, `ErrorBoundary`, `OfflineIndicator` |
| `@xnetjs/react/database`     | experimental | Database hooks while the database model converges                                                                                                                 |
| `@xnetjs/react/experimental` | experimental | Hub hooks, onboarding, sync internals, comments/history helpers, plugin hooks, security, telemetry, and other secondary surfaces                                  |
| `@xnetjs/react/internal`     | internal     | Internal helpers that are not public contract                                                                                                                     |

### Migration guidance

| Current import                                       | Preferred import                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `import { useDatabase } from '@xnetjs/react'`        | `import { useDatabase } from '@xnetjs/react/database'`            |
| `import { useComments } from '@xnetjs/react'`        | `import { useComments } from '@xnetjs/react/experimental'`        |
| `import { OnboardingProvider } from '@xnetjs/react'` | `import { OnboardingProvider } from '@xnetjs/react/experimental'` |

## `@xnetjs/data`

| Entrypoint               | Status                      | Contract                                                                                |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------- |
| `@xnetjs/data`           | stable root, mixed contents | Backward-compatible convenience barrel; for new code prefer the narrower subpaths below |
| `@xnetjs/data/schema`    | stable                      | Schema definition, property helpers, built-in schemas, registry, and migration lenses   |
| `@xnetjs/data/store`     | stable                      | `NodeStore`, adapters, store types, temp-id helpers                                     |
| `@xnetjs/data/updates`   | stable                      | Signed Yjs update utilities                                                             |
| `@xnetjs/data/awareness` | stable                      | Presence and awareness helpers                                                          |
| `@xnetjs/data/database`  | experimental                | Database operations while the canonical model converges                                 |
| `@xnetjs/data/auth`      | experimental                | Store authorization helpers during authz redesign and rollout work                      |

### Migration guidance

| Current import                                                       | Preferred import                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `import { defineSchema, text } from '@xnetjs/data'`                  | `import { defineSchema, text } from '@xnetjs/data/schema'`                 |
| `import { NodeStore, SQLiteNodeStorageAdapter } from '@xnetjs/data'` | `import { NodeStore, SQLiteNodeStorageAdapter } from '@xnetjs/data/store'` |
| `import { queryRows } from '@xnetjs/data'`                           | `import { queryRows } from '@xnetjs/data/database'`                        |
| `import { StoreAuth } from '@xnetjs/data'`                           | `import { StoreAuth } from '@xnetjs/data/auth'`                            |

## `@xnetjs/identity`

| Entrypoint                    | Status                      | Contract                                                                 |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `@xnetjs/identity`            | stable root, mixed contents | Backward-compatible barrel; narrower subpaths are preferred for new code |
| `@xnetjs/identity/did`        | stable                      | DID parsing and identity generation primitives                           |
| `@xnetjs/identity/ucan`       | stable                      | UCAN creation, verification, and capability checks                       |
| `@xnetjs/identity/key-bundle` | stable                      | Hybrid key-bundle creation and serialization                             |
| `@xnetjs/identity/passkey`    | stable                      | Identity manager and passkey-based auth helpers                          |
| `@xnetjs/identity/legacy`     | deprecated                  | Legacy key-bundle and passkey-storage compatibility exports              |

### Migration guidance

| Current import                                             | Preferred import                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `import { parseDID } from '@xnetjs/identity'`              | `import { parseDID } from '@xnetjs/identity/did'`                 |
| `import { createUCAN } from '@xnetjs/identity'`            | `import { createUCAN } from '@xnetjs/identity/ucan'`              |
| `import { createKeyBundle } from '@xnetjs/identity'`       | `import { createKeyBundle } from '@xnetjs/identity/key-bundle'`   |
| `import { BrowserPasskeyStorage } from '@xnetjs/identity'` | `import { BrowserPasskeyStorage } from '@xnetjs/identity/legacy'` |

## `@xnetjs/data-bridge`

| Entrypoint                   | Status       | Contract                                       |
| ---------------------------- | ------------ | ---------------------------------------------- |
| `@xnetjs/data-bridge`        | experimental | Broad bridge factory and implementation barrel |
| `@xnetjs/data-bridge/worker` | experimental | Worker entrypoint for browser runtimes         |
| `@xnetjs/data-bridge/native` | experimental | Native bridge entrypoint for Expo/React Native |
| `@xnetjs/data-bridge/types`  | experimental | Shared bridge types for type-only consumers    |

### Migration guidance

| Current import                                             | Preferred import                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `import { createNativeBridge } from '@xnetjs/data-bridge'` | `import { createNativeBridge } from '@xnetjs/data-bridge/native'` |
| `import type { DataBridge } from '@xnetjs/data-bridge'`    | `import type { DataBridge } from '@xnetjs/data-bridge/types'`     |

## Notes

- Root barrels still work for compatibility in this cycle.
- New examples and docs should prefer the narrower entrypoints.
- Lifecycle labels will tighten again after the runtime, database, and sync convergence steps clear release gates.
