# @xnet/sync

Unified sync primitives for xNet -- Change\<T\>, Lamport clocks, hash chains, and a comprehensive Yjs security layer.

## Installation

```bash
pnpm add @xnet/sync
```

## Features

- **Change\<T\>** -- Universal immutable sync unit for structured data
- **Lamport clocks** -- Logical timestamps for causal ordering (tick, receive, compare)
- **Hash chains** -- Tamper-evident linked update logs with fork detection
- **SyncProvider interface** -- Pluggable sync transport abstraction
- **Yjs security layer**:
  - Signed envelopes (Ed25519) for Yjs updates
  - Rate and size limits per peer
  - Hash-at-rest integrity verification
  - Peer scoring (reputation tracking)
  - ClientID-DID binding (attestation)
  - Yjs hash chain integration
  - Update batching for efficiency

## Usage

```typescript
import { createChange, type Change } from '@xnet/sync'

// Create an immutable change
const change: Change<{ title: string }> = createChange({
  author: did,
  data: { title: 'Updated title' },
  clock: lamportClock.tick()
})
```

```typescript
import { LamportClock } from '@xnet/sync'

// Logical clocks for ordering
const clock = new LamportClock()
const t1 = clock.tick() // Local event
const t2 = clock.receive(t1) // Merge with remote
const cmp = clock.compare(t1, t2) // -1, 0, or 1
```

```typescript
import { validateChain, detectFork, topologicalSort } from '@xnet/sync'

// Hash chain verification
const valid = validateChain(changes)
const fork = detectFork(chain1, chain2)
const sorted = topologicalSort(changes)
```

```typescript
import { signYjsUpdate, verifyYjsEnvelope } from '@xnet/sync'

// Signed Yjs envelopes
const envelope = signYjsUpdate(update, did, signingKey, clientId)
const { valid, update } = verifyYjsEnvelope(envelope)
```

## Architecture

```mermaid
flowchart TD
    subgraph Structured["Structured Data Sync"]
        Change["Change&lt;T&gt;<br/><small>Immutable sync unit</small>"]
        Clock["LamportClock<br/><small>Causal ordering</small>"]
        Chain["Hash Chain<br/><small>Tamper-evident log</small>"]
    end

    subgraph Yjs["Yjs Security Layer"]
        Envelope["Signed Envelopes<br/><small>Ed25519 signatures</small>"]
        Limits["Rate/Size Limits<br/><small>Per-peer throttling</small>"]
        Integrity["Hash-at-Rest<br/><small>Integrity checks</small>"]
        Scoring["Peer Scoring<br/><small>Reputation tracking</small>"]
        Attestation["ClientID-DID<br/><small>Binding attestation</small>"]
        Batcher["Update Batcher<br/><small>Efficiency</small>"]
    end

    subgraph Transport["Transport"]
        Provider["SyncProvider<br/><small>Pluggable interface</small>"]
    end

    Change --> Clock
    Change --> Chain
    Envelope --> Limits
    Envelope --> Integrity
    Limits --> Scoring
    Attestation --> Envelope
    Batcher --> Envelope
    Structured --> Provider
    Yjs --> Provider
```

## Modules

| Module                    | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `change.ts`               | Change\<T\> creation and types                          |
| `clock.ts`                | Lamport clock implementation                            |
| `chain.ts`                | Hash chain validation, fork detection, topological sort |
| `provider.ts`             | SyncProvider interface                                  |
| `yjs-envelope.ts`         | Ed25519-signed Yjs update envelopes                     |
| `yjs-limits.ts`           | Rate and size limits for Yjs updates                    |
| `yjs-integrity.ts`        | Hash-at-rest integrity verification                     |
| `yjs-peer-scoring.ts`     | Peer reputation scoring                                 |
| `clientid-attestation.ts` | ClientID-DID binding                                    |
| `yjs-change.ts`           | Yjs hash chain integration                              |
| `yjs-batcher.ts`          | Update batching for efficiency                          |

## Dependencies

- `@xnet/core` -- Core types
- `@xnet/crypto` -- Signing, hashing
- `@xnet/identity` -- DID operations

## Testing

```bash
pnpm --filter @xnet/sync test
```

10 test files covering all modules.
