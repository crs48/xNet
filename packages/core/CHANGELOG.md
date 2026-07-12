# @xnetjs/core

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
