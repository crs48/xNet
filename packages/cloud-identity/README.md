# @xnetjs/cloud-identity

The two-identity model for xNet Cloud: a **custodial billing identity** (WorkOS AuthKit) bound to a **non-custodial data DID**, with billing-only account recovery. See explorations 0174/0175.

The billing identity is who pays; the data DID is who owns the data. They are bound together, but losing access to one never grants access to the other's secrets — account recovery only ever recovers the _paid account_, never the user's keys.

## Features

- **Identity binding** -- `bindIdentities`, `recoverPaidAccount`, `completeRebind`, and `MemoryBindingStore`: link a billing user to a data DID and re-bind a recovered account, gated by a DID challenge verifier
- **Billing identity provider** -- `BillingIdentityProvider` interface with `MemoryBillingIdentityProvider` for local dev
- **WorkOS AuthKit** -- `WorkOSAuthKitProvider`: the production billing provider (free tier), with a contract test suite

## Usage

```typescript
import { bindIdentities, MemoryBindingStore } from '@xnetjs/cloud-identity'

const store = new MemoryBindingStore()
const binding = await bindIdentities(
  { billingUserId: 'user_123', did: 'did:key:z...' },
  { store, verifyDid }
)
```

The provider is environment-driven: WorkOS when `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` / `WORKOS_REDIRECT_URI` are set, otherwise the in-memory provider for local dev.

## Modules

| Module        | Description                                          |
| ------------- | ---------------------------------------------------- |
| `binding.ts`  | Bind billing identity ↔ data DID, recovery / re-bind |
| `provider.ts` | `BillingIdentityProvider` interface + in-memory impl |
| `workos.ts`   | WorkOS AuthKit provider                              |

## Testing

```bash
pnpm --filter @xnetjs/cloud-identity test
```

Tests run with no provider keys — WorkOS calls are stubbed with [`msw`](https://mswjs.io/).
