# @xnetjs/devkit

## 1.0.1

### Patch Changes

- [#571](https://github.com/crs48/xNet/pull/571) [`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6) Thanks [@crs48](https://github.com/crs48)! - Document alpha status in every package README. xNet is released — these packages
  are on npm and usable today — but it is early software: APIs can change between
  releases, sometimes without a migration path. Each README now says so up front,
  so the notice is visible on the npm package page. Docs only; no code changes.

- [#587](https://github.com/crs48/xNet/pull/587) [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe) Thanks [@crs48](https://github.com/crs48)! - Fix TypeScript type resolution for every package's export map, and ship
  `@xnetjs/data/portability`.

  `types` was ordered after `import` in 48 export subpaths across 19 packages.
  Export conditions are order-sensitive, so TypeScript could resolve the wrong
  entry — or no types at all — depending on the consumer's `moduleResolution`.
  `types` is now first everywhere.

  `@xnetjs/data` also advertised a `./portability` subpath that was never added to
  its build, so `@xnetjs/data/portability` — the `.xnetpack` export/import codec —
  did not resolve at all for consumers. It now builds and ships.

  Both were found by adding `publint` to CI.

- [#565](https://github.com/crs48/xNet/pull/565) [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6) Thanks [@crs48](https://github.com/crs48)! - Spell the brand `xNet` consistently in source comments

  Doc-comment and JSDoc prose only — no exported names, signatures, runtime
  values, or wire contracts changed. Included so the release notes record why
  these packages show a diff.

## 1.0.0

### Major Changes

- [#439](https://github.com/crs48/xNet/pull/439) [`677856e`](https://github.com/crs48/xNet/commit/677856e0317800a0f6e78531ae490aca744570d9) Thanks [@crs48](https://github.com/crs48)! - Secure the browser↔local-model bridge (exploration 0289).
  - **`@xnetjs/devkit` (breaking):** the agent bridge daemon now **requires a
    per-launch pairing token** (`Authorization: Bearer <token>`, constant-time
    compared) on its data endpoints (`/v1/chat/completions`, `/run`) and validates
    the `Host` header to reject DNS-rebinding requests. `BridgeServerConfig` gains
    `pairingToken?`, `BridgeServerHandle` exposes `pairingToken`, and a token is
    auto-generated when none is supplied — so a client that previously called the
    data endpoints with no auth now gets `401`. `/health` stays unauthenticated so
    detection still works before pairing. New `openAiChatAgent` lets the bridge
    front a raw OpenAI-compatible model server (Ollama/LM Studio) through the same
    authenticated door.
  - **`@xnetjs/plugins`:** `ConnectorEnv` gains `appOrigin` and the local-server
    setup hint now names the exact `OLLAMA_ORIGINS=<origin>` line (never a
    wildcard); new `localServerSetupHint` export; the MCP HTTP transport now
    validates the `Host` header (defense-in-depth, no change for legitimate
    callers). Additive.
  - **`@xnetjs/cli`:** `xnet bridge serve` prints the pairing code and gains
    `--token` (pin the code) and `--upstream` / `--upstream-model` (front a raw
    local model). Additive.

### Patch Changes

- [#446](https://github.com/crs48/xNet/pull/446) [`10c9f87`](https://github.com/crs48/xNet/commit/10c9f87a20264bae60e2bee51eb31fb849364be7) Thanks [@crs48](https://github.com/crs48)! - Isolate git subprocesses from inherited repo-location env. When the dev loop (or
  its tests) ran while a git hook was active — e.g. husky `pre-push` running
  `pnpm test` — the hook's exported `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`
  leaked into `git` children and overrode the explicit `cwd`, so operations
  (`config`, `commit`, even `push`) targeted the hook's repo instead of the
  requested worktree. `NodeCommandRunner` now scrubs git's repo-location env vars
  for `git` invocations so `cwd` is always authoritative; an explicit
  `options.env` entry still wins.

## 0.0.2

### Patch Changes

- [#262](https://github.com/crs48/xNet/pull/262) [`6183829`](https://github.com/crs48/xNet/commit/618382920002a39f00e4f5f4a2ae604c2aef4fa6) Thanks [@crs48](https://github.com/crs48)! - First public release. These MIT packages are runtime or public-API dependencies
  of already-published packages (`@xnetjs/plugins` → `trust` + `slack-compat`,
  `@xnetjs/react` → `billing`, `@xnetjs/cli` → `devkit`), so publishing them closes
  the dependency graph and lets those packages install cleanly from npm.
