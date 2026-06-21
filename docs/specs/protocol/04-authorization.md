# L3 · Authorization

**This document is normative.** Part of [XNet Protocol `xnet/1.0`](00-overview.md).

Authorization in XNet is **data, not application logic**: access rules are
declared on schemas and delegated through `Grant` nodes and UCAN tokens, and they
are enforced at the [sync boundary](03-replication.md). Because two
implementations that disagree on policy evaluation will make different read/write
decisions on the same graph, the *decision semantics* are normative — even though
caching and indexing strategies are private.

Reference: [`packages/core/src/auth-types.ts`](../../../packages/core/src/auth-types.ts),
[`packages/data/src/auth/`](../../../packages/data/src/auth/),
[`packages/data/src/schema/schemas/grant.ts`](../../../packages/data/src/schema/schemas/grant.ts).

## 1. Actions

```
action ∈ { read, write, delete, share, admin }
```

A decision is a function `can(subject: DID, action, nodeId) → { allowed, reasons }`.

## 2. Schema authorization definition

A schema MAY carry an `authorization` block defining **roles** (how a subject
acquires a role on a node) and **actions** (which roles may perform each action):

```ts
interface AuthorizationDefinition {
  roles:   Record<string, RoleResolver>        // how to earn a role
  actions: Record<AuthAction, AuthExpression>  // who may do what
  publicProps?: string[]                        // props readable without decryption
  fieldRules?: Record<string, { allow: AuthExpression; deny?: AuthExpression }>
}
```

Common presets (reference [`auth/presets.ts`](../../../packages/data/src/auth/presets.ts)):
`presets.private()` (owner‑only), `spaceCascadeAuthorization()` (inherit from a
containing Space). The default for a schema with no `authorization` is
implementation‑defined but SHOULD be owner‑only.

## 3. Role resolvers

A role resolver determines whether a subject holds a named role on a node. `xnet/1.0`
defines four kinds (reference [`auth-types.ts`](../../../packages/core/src/auth-types.ts)):

| Kind | Subject earns the role when… |
|---|---|
| **creator** | `subject == node.createdBy` |
| **property** | `subject` appears in a named `person`/`relation` property (e.g. `editors`) |
| **relation** | `subject` holds a role on a *related* node (role inheritance along a relation) |
| **membership** | a membership edge node (e.g. `SpaceMembership`) links `subject`→container with a role ≥ `minRole`; supports cascade to nested containers via a `parent` prop |

Role resolution walks relations/memberships with a **bounded depth** (the
reference bound is 3) and MUST terminate (cycles are broken). Implementations
MUST resolve roles identically for the decision‑trace vectors (§7).

## 4. The expression AST

Actions map to a boolean expression over roles:

```
expr ::= allow(role…) | deny(role…) | roleRef(name)
       | and(expr…) | or(expr…) | not(expr)
       | PUBLIC | AUTHENTICATED
```

Evaluation rules (MUST):

- **Deny wins.** If any matching `deny` evaluates true, the action is denied,
  regardless of any `allow`.
- `and` requires all sub‑expressions; `or` requires any; `not` negates.
- `PUBLIC` is always true; `AUTHENTICATED` is true for any valid DID subject.
- Evaluation is total and deterministic for a given (subject, node, graph).

## 5. Encryption as access control

For private nodes, **the ability to decrypt is the read‑control mechanism**:
content keys are wrapped per recipient ([L0 §5](01-primitives.md)). A subject not
in the recipient set cannot read the encrypted properties even if it receives the
bytes. `publicProps` (and the four universal node fields) remain readable for
indexing/attribution; `createdBy` is always readable. Field‑level rules
(`fieldRules`) further gate individual properties. Read‑filtering happens
*after* decryption.

## 6. Grants and UCAN (delegation)

Authority is delegated two ways:

**Grant nodes** — a `Grant` is an ordinary XNet node (schema
[`grant.ts`](../../../packages/data/src/schema/schemas/grant.ts)) recording
`{ issuer, grantee, resource, resourceSchema, actions, expiresAt, revokedAt,
ucanToken?, parentGrantId? }`. A grant is **active** iff not revoked and not
expired. An implementation maintains an index `resource → grantee → grants` and
consults it during evaluation.

**UCAN tokens** — [UCAN 1.0](https://github.com/ucan-wg/spec) capability tokens
(JWT/EdDSA) carry `{ iss, aud, exp, att:[{ with, can }], prf:[…] }`. Verification
(MUST): valid EdDSA signature by `iss`; not expired; each capability is an
**attenuation** of (a subset of) its proof chain's capabilities; child `exp` ≤
parent `exp`; proof chains are acyclic. Capability matching: `can = "*"` matches
any action; `with` matches by exact resource or a `prefix/*` wildcard. Reference:
[`packages/identity/src/ucan.ts`](../../../packages/identity/src/ucan.ts).

## 7. Evaluation pipeline & determinism

```mermaid
flowchart TB
  Q["can(subject, action, nodeId)"] --> ND{node-level deny?}
  ND -->|yes| DENY["DENY"]
  ND -->|no| RR["resolve roles (creator / property / relation / membership, depth ≤ 3)"]
  RR --> SE["evaluate schema action expression (deny-wins)"]
  SE -->|allowed| ALLOW["ALLOW"]
  SE -->|not allowed| GR{active grant or UCAN capability?}
  GR -->|yes| ALLOW
  GR -->|no| PUB{PUBLIC / publicProps?}
  PUB -->|yes| ALLOW
  PUB -->|no| DENY
```

The order is fixed: **node‑deny → role‑resolve → schema‑eval → grant/UCAN →
public**. Caching, TTLs, and the grant index are implementation‑private, but the
*decisions* MUST match the [decision‑trace golden vectors](90-conformance.md)
(`conformance/vectors/authz/`), which give `{ graph, subject, action, nodeId } →
{ allowed, reason }`.

The current [`authz` suite](../../../conformance/vectors/authz) pins the
deterministic heart of §4 — **expression‑AST evaluation** (`{ expression, roles,
isAuthenticated } → { allowed }`), covering `allow`/`deny`/`and`/`or`/`not`/
`roleRef`/`PUBLIC`/`AUTHENTICATED` and the `and(allow(…), not(deny(…)))`
deny‑wins composition. Full end‑to‑end decision traces (role resolution over a
node graph + grants/UCAN) are tracked as a follow‑up XPP and added as that
reference path stabilises.

Continue to [Schema evolution →](05-schema-evolution.md)
