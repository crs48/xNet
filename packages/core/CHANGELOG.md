# @xnetjs/core

## 2.3.0

## 2.2.0

## 2.1.0

## 2.0.0

## 1.0.0

### Major Changes

- [#482](https://github.com/crs48/xNet/pull/482) [`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174) Thanks [@crs48](https://github.com/crs48)! - Grinding-resistant Last-Write-Wins tiebreak (protocol v4, exploration 0305)

  The final LWW conflict tiebreak was the raw author DID ("higher DID wins").
  Because a `did:key` is a free, attacker-chosen function of a keypair, an
  attacker could grind a vanity DID that sorts highest and win **every**
  concurrent-write tie against every honest peer, permanently.

  Protocol v4 replaces that final rung with a per-conflict key,
  `blake3(authorDID ‖ property ‖ value)` (`computeLwwTiebreakKey` in
  `@xnetjs/core`), so the winner of a tie is a random-oracle function of _what is
  written_ — a ground identity wins no durable, universal advantage. The key is
  gated on both changes being v4 (legacy changes fall back to the author DID), is
  derived at resolution time (never part of the change hash or wire format), and
  is threaded through `PropertyTimestamp`, the SQLite `node_properties` guard (new
  nullable `tiebreak_key` column, schema v8), and every conformance kernel.

  BREAKING: `CURRENT_PROTOCOL_VERSION` is now `4` and new changes are stamped v4.
  The LWW golden vectors gain `0005-tie-grinding-resistant-key`; `LwwStamp` /
  `PropertyTimestamp` gain an optional `tiebreakKey`. Mixed fleets converge on
  exact `{lamport, wallTime}` ties only once both peers are on v4 — a transient
  rollout window affecting rare exact ties.

### Minor Changes

- [#488](https://github.com/crs48/xNet/pull/488) [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28) Thanks [@crs48](https://github.com/crs48)! - Schema authorization gains `create` and `update` actions — optional refinements of `write` (exploration 0304). A schema may now split its mutation policy into who may **add** nodes vs. who may **modify** existing ones; when a refinement is absent it falls back to the schema's `write` expression, so existing schemas behave identically.
  - `@xnetjs/core`: `AUTH_ACTIONS` includes `create`/`update`; new `actionExpressionOrder()` and `grantActionSatisfies()` helpers (a `write` grant covers both refinements; granular grants cover only themselves).
  - `@xnetjs/data`: the policy evaluator resolves actions with the fallback and evaluates `create` against the draft node built from the payload (container relations resolve membership, so creation into a shared Space is genuinely gated); `NodeStore` checks the precise verbs, and remote creates are inferred and checked as `create` instead of failing closed on a not-yet-existing node. New `spaceContributorAuthorization()` cascade — adopted by `ChatMessage` and `Comment` — expresses "members may post, only the author (or space admins) may edit". `StoreAuthAPI.can` accepts an optional draft `node`.
  - `@xnetjs/react`: new `useCanCreate(schemaId, properties)` hook; `useCan`/`useCanEdit` check the precise `update` verb.
  - `@xnetjs/runtime`: conformance corpus gains the `authz-actions` suite pinning the fallback table.

### Patch Changes

- [#483](https://github.com/crs48/xNet/pull/483) [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c) Thanks [@crs48](https://github.com/crs48)! - docs(exploration): renumber Effect adoption doc 0300 -> 0303 (collision)

  Exploration numbers collided across parallel worktrees again (0301 gotcha):
  0300 was already taken by RUNNING_AN_XNET_HUB_ON_A_RASPBERRY_PI ([#477](https://github.com/crs48/xNet/issues/477)) and
  0301/0302 are claimed. Renames the doc and updates the exploration-number
  references in code comments and CLAUDE.md; no code change (empty changeset).

  Signed-off-by: xNet Test <test@xnet.dev>

## 0.12.0

### Minor Changes

- [#480](https://github.com/crs48/xNet/pull/480) [`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141) Thanks [@crs48](https://github.com/crs48)! - New `@xnetjs/core` utilities (exploration 0303 — Effect Tier 0): a
  dependency-free `RetryPolicy` vocabulary (`fixed`, `exponential`, `capped`,
  `jittered`, `limitAttempts`), a `TaggedError` base class with `isTagged`
  guard for string-discriminant errors, and a `singleFlight` promise-dedupe
  helper.

  Internal refactors onto them (no behavior change): both sync reconnect
  loops (`@xnetjs/runtime`) now share one scheduler with their existing
  backoff schedules preserved; the webhook emitter (`@xnetjs/plugins`) uses
  the shared exponential policy; the schema registry and sqlite adapter
  diagnostics memo (`@xnetjs/data`) use `singleFlight`. `NodeRelayError` and
  `PermissionError` now extend `TaggedError` — `instanceof`, `.name`, and
  `.code` matching are unchanged.

## 0.11.1

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.0

## 0.3.0

### Minor Changes

- [#401](https://github.com/crs48/xNet/pull/401) [`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed) Thanks [@crs48](https://github.com/crs48)! - Add the shared Last-Write-Wins ordering module to `@xnetjs/core`
  (`compareChangeApplicationOrder`, `compareLwwStamps`, `lwwWins`,
  `lwwUpdateGuardSql`, `LwwStamp`) — the single canonical LWW comparison used
  across the stack (protocol §L1.7).

  `@xnetjs/data`, `@xnetjs/plugins`, and `@xnetjs/react` adopt it and receive
  internal decompositions of their most-churned modules (NodeStore query
  compiler/hydration/transaction execution, ai-surface tool registry and
  resource URI router, XNetProvider provider units). No public API changes in
  those packages.

## 0.2.0

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- [#284](https://github.com/crs48/xNet/pull/284) [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4) Thanks [@crs48](https://github.com/crs48)! - Add shared dependency-free helpers to `@xnetjs/core` and unify the SSRF guard.

  `@xnetjs/core` now exports `clamp`, `clamp01`, `formatBytes`, and the
  literal-host SSRF guard (`assertPublicUrl`, `validateExternalUrl`, `SsrfError`),
  replacing several behaviour-identical copies that had drifted across packages —
  including byte formatters that silently capped at megabytes and a regex-based
  URL guard that missed private ranges (CGNAT, IPv4-mapped IPv6, NAT64, the
  `fe81::–fe8f::` link-local block, and the trailing-dot bypass).
  `@xnetjs/plugins` now delegates its outbound-action SSRF check to the canonical
  guard while keeping its `ActionSsrfError` contract; `@xnetjs/react` byte
  displays no longer cap at megabytes.

## 0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
