# packages/hub — relay and sync server

Loaded on demand when an agent reads files here. `packages/AGENTS.md` and the
root `AGENTS.md` both still apply.

## Roles (0383)

One binary, named roles — see `roles.ts`. Splitting is by **authority**, not by
weight. A **subscriber mirrors only `/sub/*`**; a PDS is a sidecar, never a
role.

The hub has a system identity: its DID is served on `/health`.

## Wire format

**Node changes on the wire must be publish-wrapped.** An unwrapped change is a
protocol error, not a shortcut — a changed wire contract is a **major** bump
(see `packages/AGENTS.md` → Changesets).

Yjs updates are signed with Ed25519 and verified before applying. Rate limiting
and peer scoring protect against abuse.

## Authorization

**Never authorize on `doc_meta.ownerDid`.** That field is a cache, not a
capability; authorization goes through the access model. This has been a real
bug once — do not reintroduce it.

## Testing

`test/relay.test.ts` and `test/crawl.test.ts` are integration tests using real
timers, servers and disk — the suite's flake reservoir. Rewrite them toward unit
tests **on touch**, not as a campaign.
