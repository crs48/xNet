# xnet-cloud

The xNet Cloud control plane — billing, provisioning, and fleet management. See explorations 0174/0175.

A [Hono](https://hono.dev/) HTTP service that composes the cloud packages into a working control plane. It is written once against the package interfaces; production swaps the in-memory stores and provisioner for durable, real-substrate implementations without touching the control-plane code.

## Composition

| Concern          | Default (dev)                   | Production                                |
| ---------------- | ------------------------------- | ----------------------------------------- |
| Billing identity | `MemoryBillingIdentityProvider` | `WorkOSAuthKitProvider` (when env is set) |
| Identity binding | `MemoryBindingStore`            | durable store                             |
| Provisioner      | `MemoryProvisioner`             | real adapter (Cloud Run + Turso, etc.)    |
| Tenant registry  | `MemoryTenantStore`             | durable store                             |

`resolveBillingProvider` picks WorkOS AuthKit when `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_REDIRECT_URI` are set, otherwise the in-memory provider.

## Development

```bash
pnpm --filter xnet-cloud dev      # run the control plane with tsx
```

## Build & run

```bash
pnpm --filter xnet-cloud build
pnpm --filter xnet-cloud start
```

## Structure

| File               | Description                                         |
| ------------------ | --------------------------------------------------- |
| `index.ts`         | Composition root + `buildControlPlane` entrypoint   |
| `control-plane.ts` | `ControlPlane` — orchestrates identity/provisioning |
| `server.ts`        | Hono HTTP app (`createControlPlaneApp`)             |
| `registry.ts`      | Tenant store (`MemoryTenantStore`)                  |

## Dependencies

- [`@xnetjs/cloud/identity`](../../packages/cloud-identity) — billing identity ↔ data DID
- [`@xnetjs/entitlements`](../../packages/cloud-plans) — plan catalog + entitlements
- [`@xnetjs/cloud/provisioner`](../../packages/cloud-provisioner) — per-tenant hub provisioning

## Testing

```bash
pnpm --filter xnet-cloud test
```
