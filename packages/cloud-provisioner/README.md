# @xnetjs/cloud-provisioner

Substrate-agnostic per-tenant hub provisioning for xNet Cloud. See exploration 0175.

The control plane is written **once** against the {@link Provisioner} interface; adapters target different substrates (Cloud Run + Turso, Fargate + Litestream, in-memory). `MemoryProvisioner` is a working fake for dev and tests.

## Features

- **Provisioner contract** -- `Provisioner`, `ProvisionSpec`, `HubHandle`, `HubState` plus `NotImplementedError` / `UnknownTenantError`
- **Sharding** -- `ShardAllocator` and `projectForServiceIndex`: deterministic placement of tenants across service shards
- **Adapters**
  - `MemoryProvisioner` -- in-memory fake for local dev and tests
  - `CloudRunTursoProvisioner` -- Google Cloud Run + Turso
  - `FargateLitestreamProvisioner` -- AWS Fargate + Litestream → R2

## Usage

```typescript
import { MemoryProvisioner } from '@xnetjs/cloud-provisioner'

const provisioner = new MemoryProvisioner()
const hub = await provisioner.provision({ tenantId: 'tenant_123', plan: 'starter' })

console.log(hub.state) // "running"
```

Swap `MemoryProvisioner` for a real adapter in production — the control-plane code that consumes `Provisioner` is unchanged.

## Modules

| Module                           | Description                             |
| -------------------------------- | --------------------------------------- |
| `types.ts`                       | `Provisioner` contract and shared types |
| `sharding.ts`                    | Shard allocation / placement            |
| `memory.ts`                      | In-memory provisioner                   |
| `adapters/cloud-run-turso.ts`    | Cloud Run + Turso adapter               |
| `adapters/fargate-litestream.ts` | Fargate + Litestream adapter            |

## Testing

```bash
pnpm --filter @xnetjs/cloud-provisioner test
```
