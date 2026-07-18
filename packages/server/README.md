# @xnetjs/server

Bring-your-own-backend server kit for xNet React (exploration 0223).

Run xNet's data layer on **your own centralized server**, gated by **your own
auth**, stored in **your own database** — while React keeps the unchanged
`useQuery` / `useMutate` / `useNode` hooks. No UCAN, no `did:key` required from
your end users.

> **Status: foundational core.** This package ships the engine — a server-side
> structured-query executor over a `NodeStore`, a backend-authoritative mutation
> path, the developer auth hooks, and the identity **trust spectrum**. The
> networked transports (WebSocket relay, HTTP/Express/Hono/Next adapters), a
> Postgres storage adapter, live streaming/invalidations, and the full
> `DataBridge` write client are tracked as follow-ups in the exploration doc.

## What's here

- **`createXNetServer(options)`** — the engine. Owns a server-side `NodeStore`
  over a pluggable `NodeStorageAdapter` (in-memory by default).
- **`server.query(request)`** — the *server side* of the `RemoteNodeQueryClient`
  protocol: the structured-query executor the xNet hub never had (the hub only
  did full-text search). Authenticates → scopes via `authorizeRead` → runs →
  returns a protocol `RemoteNodeQueryResponse`.
- **`server.mutate(token, input)`** — backend-authoritative writes:
  authenticate → validate via `authorizeWrite` → apply per the trust mode, with
  a typed `MutationResult` (no silent failures).
- **`server.createRemoteQueryClient(getToken)`** — an in-process
  `RemoteNodeQueryClient` that drops straight into `XNetProvider`'s
  `remoteNodeQueryClient` config, so React reads route here with no hook changes.

## Three hooks map your auth onto the data layer

```ts
import { createXNetServer } from '@xnetjs/server'

const xnet = await createXNetServer({
  trust: 'custodial',
  // 1. Exchange a token/cookie for your own principal — no DID needed.
  authenticate: async (token) => verifyMySession(token), // → { subject, ...claims } | null
  // 2. Scope what a subject can read (row-level security).
  authorizeRead: (ctx, query) => query.and({ tenant: ctx.tenant }),
  // 3. Validate writes in your own terms. For update/delete, authorize against
  //    the STORED node (`write.existing`) — not the client-supplied data — so a
  //    by-id write can't target another tenant's node.
  authorizeWrite: (ctx, write) => {
    const tenant =
      write.op === 'create' ? write.payload.properties.tenant : write.existing?.properties.tenant
    return tenant === ctx.tenant ? { ok: true } : { ok: false, reason: 'wrong tenant' }
  }
})
```

## The trust spectrum

How an end-user's identity maps onto xNet's signed-change model:

| Mode | Who signs | `authorDID` | Best for |
| --- | --- | --- | --- |
| `server` (default) | server, one identity | the server | centralized apps, max simplicity |
| `custodial` | server, per-user derived key | stable per-user DID | mainstream apps wanting per-user attribution, no key UX |
| `signed` | the client | the client's DID (bound to the authenticated subject) | tamper-evident, user-owned data |

In `signed` mode the server verifies the client's signature **and** that the
change's author matches the authenticated subject — a forged `authorDID` is
rejected (`IDENTITY_MISMATCH`), a tampered change is rejected
(`SIGNATURE_INVALID`).

See `docs/explorations/0223_[_]_XNET_REACT_WITH_YOUR_OWN_SERVER_AND_AUTH.md`.
