# @xnetjs/core

Core types, content addressing, and permission primitives for xNet. This is the leaf package -- it has no internal `@xnetjs/*` dependencies.

## Installation

```bash
pnpm add @xnetjs/core
```

## Features

- **Content addressing** -- BLAKE3-based CIDs (`cid:blake3:{hash}`), Merkle trees
- **Signed updates** -- Vector clocks, signed update types for causal ordering
- **Snapshots** -- Point-in-time snapshot types for state persistence
- **Verification** -- Fork detection, update chain verification
- **DID resolution** -- Pluggable DID resolver interface
- **Query federation** -- Types for cross-hub federated queries
- **Permissions** -- Role-based access control (RBAC), capabilities

## Usage

```typescript
import { hashContent, createContentId, verifyContent, buildMerkleTree } from '@xnetjs/core'

// Hash content with BLAKE3
const hash = hashContent(new Uint8Array([1, 2, 3]))

// Create a content-addressed ID
const cid = createContentId(data)

// Verify content integrity
const isValid = verifyContent(cid, data)

// Build a Merkle tree
const tree = buildMerkleTree(chunks)
```

```typescript
import { detectFork, verifyUpdateChain } from '@xnetjs/core'

// Verify an update chain
const valid = verifyUpdateChain(updates)

// Detect forks in update history
const fork = detectFork(chain1, chain2)
```

## Modules

| Module            | Description                        |
| ----------------- | ---------------------------------- |
| `content.ts`      | Content addressing, CID creation   |
| `hashing.ts`      | BLAKE3 hashing, Merkle trees       |
| `snapshots.ts`    | Snapshot types and utilities       |
| `updates.ts`      | Signed updates, vector clocks      |
| `verification.ts` | Fork detection, chain verification |
| `resolution.ts`   | DID resolver interface             |
| `federation.ts`   | Federated query types              |
| `permissions.ts`  | Roles, capabilities, RBAC          |

## Testing

```bash
pnpm --filter @xnetjs/core test
```
