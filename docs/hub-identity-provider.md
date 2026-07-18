# Your hub as your team's identity provider

_Exploration 0338, Phase 3. Status: opt-in, MIT, self-host-first._

An xNet hub can be an identity provider in two directions. Both are optional,
off by default, and never hold your signing keys — the `did:key` kernel stays
sovereign. Hubs mint **sessions and attestations**, never root keys.

## Outbound: the hub IS an OIDC provider (the `tsidp` pattern)

When you enable it, your hub becomes an OpenID Connect provider for the *other*
self-hosted tools your team runs — Grafana, Gitea, a wiki — so people sign into
all of them with the xNet identity they already have.

```jsonc
// hub config
{
  "auth": true,                       // required — see the safety note below
  "publicUrl": "https://hub.acme.dev", // becomes the OIDC issuer
  "identity": {
    "oidcProvider": {
      "enabled": true,
      "clients": [
        {
          "client_id": "grafana",
          "client_secret": "…",
          "redirect_uris": ["https://grafana.acme.dev/login/generic_oauth"]
        }
      ]
    }
  }
}
```

- **Login interaction** is the user's existing passkey unlock — no new password
  surface.
- **Subjects are `pairwise`**: each relying party sees a different, stable `sub`
  for the same user, so apps can't correlate identities across services unless
  the user opts in.
- **Claims** come from the user's `profile-<did>` node: `name` (display name)
  and `preferred_username` (the verified ATProto handle when linked, else the
  workspace handle).
- Built on [`node-oidc-provider`](https://github.com/panva/node-oidc-provider)
  (MIT, the only certified OP that mounts in-process in Node). The dependency is
  loaded lazily, so a hub with the feature disabled never pays for it.

**Safety:** the provider refuses to start when `auth: false`. An OIDC provider on
top of an open relay would mint tokens for an unauthenticated free-for-all
(explorations 0307 / 0338). In production, supply a stable `jwks` so id_token
signing keys survive restarts.

## Inbound: bring your own OIDC (the Tailscale pattern)

Point the hub at your org's existing IdP (Google Workspace, Microsoft Entra,
Okta, Keycloak…). A verified IdP session **admits a device into the org's
account ledger** (exploration 0149); it is not a substitute for the user's keys.

```jsonc
{
  "identity": {
    "byoOidc": {
      "issuer": "https://accounts.acme.com",
      "clientId": "xnet-hub-acme"
    }
  }
}
```

Flow:

1. A new team member signs into your IdP and obtains an `id_token`.
2. The hub verifies it against the issuer's JWKS (`verifyByoOidcToken`) — issuer,
   audience, signature, and expiry all checked.
3. On success, the member's **device DID** is admitted to the org's account
   ledger (a signed `DeviceRecord`), and existing content is re-wrapped to the
   new device through the ledger's recipient expander — the same mechanism that
   powers "add a device" (0243).

### Threat model — what the IdP sees, and what it does not

| The IdP **can** observe | The IdP **cannot** observe or do |
| --- | --- |
| That a device was admitted (a login event: who, when) | Any workspace content — it is end-to-end encrypted |
| The member's email / directory attributes it already holds | The member's signing or encryption keys — these never leave the device |
| That the member belongs to this org's hub | Read or write nodes; content keys are re-wrapped through the ledger, not the IdP |
| Revoke *future* device admissions by disabling the IdP user | Decrypt data a member already synced — revocation blocks new admissions, it is not a remote wipe |

Two consequences worth stating plainly to org admins:

- **Disabling an IdP user blocks new device admissions but does not
  retroactively lock existing data.** A member who already synced keeps their
  local copy. To cut off ongoing access, revoke the device in the ledger
  (which stops re-wraps) and rotate the shared content key.
- **The IdP is an availability dependency for onboarding, not a
  confidentiality dependency.** If the IdP is down, new members can't be
  admitted, but existing members keep working offline-first.

## Where WorkOS fits

WorkOS stays the **cloud** billing/SSO door (`packages/cloud`, FSL-licensed),
free to 1M MAU with enterprise SAML at $125/connection. It is never imported by
the hub. For self-hosters, BYO-OIDC above is the equivalent capability with no
vendor dependency. Both WorkOS and an ATProto identity can also act as a
**recovery anchor** (0243/0322/0338) behind one `RecoveryAnchorProvider`
interface, writing the same PIN-sealed escrow envelope the hub can never open.
