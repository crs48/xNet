# Hub-as-PDS spike and go/no-go (Phase 4, demand-gated)

_Exploration 0338, Phase 4. Status: **not built** — decision record + ops
sketch. Revisit against the trigger metrics below._

Phases 1–3 give xNet users a free global name **without operating any ATProto
infrastructure**: identities live on Bluesky's hosted PDS (or any PDS), and the
hub only verifies bindings and (optionally) acts as an OIDC provider. Turning a
hub into a literal PDS — so an org's hub *is* its members' ATProto home — is the
endgame, but it is deliberately deferred.

## Why defer

- **Federation caps.** Bluesky's self-hosted PDS is still early-access:
  ~10 accounts per PDS, 1,500 events/hour, 10,000 events/day. That is a
  hobbyist tier, not "your team's PDS."
- **Ops burden.** A PDS needs SMTP for email verification, its own TLS
  hostname, backups, and the `did:plc` rotation-key custody story — a real
  service, not a feature flag.
- **No demand signal yet.** Phases 1–2 must show that people actually link
  ATProto identities before we take on running PDSes.

## Ops sketch (when we do it)

Prototype by mounting the **official** `@atproto/pds` container alongside the
hub behind one hostname — do **not** write a native PDS first (0301 Phase 3):

```
hub.acme.dev        → xNet hub (sync relay, OIDC provider, binding verifier)
pds.acme.dev        → @atproto/pds (official image), same VPS
```

- Fits the same $5–20/mo VPS class as a hub (1 GB RAM, 1 vCPU, ~50 GB disk).
- The hub's binding verifier already resolves `did:web`/`did:plc` and fetches
  records over HTTPS, so a hub-hosted PDS needs no special-casing on the xNet
  side — it is just another PDS host.
- Rotation-key sovereignty (Phase 2) becomes even more important here: the org
  runs the PDS, so members should hold a **higher-priority** rotation key than
  the org's PDS key, exactly as `derivePlcRotationKey` +
  `withUserPriorityRotationKey` already produce.

## Go/no-go trigger metrics

Build the hub-as-PDS path only when **both** hold:

1. **Federation caps have lifted** to at least a typical team size — track
   `bluesky-social/pds` releases; trigger at **≥ 50 accounts/PDS** with daily
   event limits that clear a small active team (say ≥ 100k events/day).
2. **Binding adoption is real** — at least a meaningful fraction of active
   workspaces have completed a Phase-1 ATProto link (`atprotoHandle` set on the
   canonical profile). Suggested bar: **≥ 20%** of active workspaces, or a
   direct customer ask from an org that wants to self-host identity end-to-end.

Until then, Phases 1–3 are the shipped answer, and this document is the standing
reminder of what "done" looks like and when to reopen it.

## WorkOS enterprise SSO (also Phase 4)

Separately from PDS hosting, paying cloud tenants can pin sign-in to an
enterprise IdP via a WorkOS SSO connection. This is implemented in
`WorkOSAuthKitProvider.getAuthorizationUrl` (`connectionId` / `organizationId`
options route through a SAML/OIDC connection instead of hosted AuthKit). The
connection itself is a paid WorkOS per-connection add-on ($125/connection/mo,
tiering down) configured per enterprise customer in the WorkOS dashboard — no
hub code, and never imported by the MIT hub.
