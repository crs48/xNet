# @xnetjs/devkit

## 1.1.0

### Minor Changes

- [#668](https://github.com/crs48/xNet/pull/668) [`2c148e8`](https://github.com/crs48/xNet/commit/2c148e8f134b0062ea9bca7af888710834f1ad91) Thanks [@crs48](https://github.com/crs48)! - Agent accountability substrate and JSON-RPC agent adapters (exploration 0416).

  **`@xnetjs/identity`** — `enrollForeignAgent()` mints a scoped Agent Passport
  from a verified foreign credential (a Buzz `npub`, an A2A agent card), with the
  proof verifier injected so no ecosystem-specific dependency enters the package.
  Passport revocation is no longer expiry-only: `revokeAgentPassport()` signs a
  denylist entry and `verifyAgentPassport()` consults one via the new
  `revocations` option.

  **`@xnetjs/data`** — new `@xnetjs/data/agent-audit` sub-entry: build, serialize
  and **offline-verify** an `AgentAuditBundle`. `verifyAgentAudit()` checks the
  passport, every change's hash and signature, the unbroken per-author chain (which
  is what catches a _removed_ action), and that every high/critical action carries
  an operator-signed approval.

  **`@xnetjs/plugins`** — a per-session egress budget (`EgressMeter`) meters agent
  reads and raises a typed `EgressBudgetError` rather than returning a silently
  truncated result. The model lane now emits the same `AiAgentFrame` vocabulary the
  bridge lane speaks, via the new `onFrame` runtime option.

  **`@xnetjs/devkit`** — `codexAppServerChatAgent()` and `acpChatAgent()` drive
  Codex `app-server` and any ACP agent over a new JSON-RPC-over-stdio transport
  (`JsonRpcSession`, `NodeDuplexRunner`), so conversations resume on a thread
  instead of replaying history. `createPermissionBroker()` plus
  `POST /v1/agent/permission` give the bridge a real answer channel, so a
  permission request can be approved in-app instead of only displayed.

  **`@xnetjs/cli`** — `xnet audit verify <bundle>` verifies an exported audit
  bundle offline and exits non-zero on any problem.

  All additions are additive; no existing export changed shape.

- [#623](https://github.com/crs48/xNet/pull/623) [`380385c`](https://github.com/crs48/xNet/commit/380385cfdf006e91a8d6ca04424ddd2d2eedd504) Thanks [@crs48](https://github.com/crs48)! - Structured agent frames for the bridge (exploration 0392). The agent bridge can
  now stream a turn as structured `AgentFrame`s — tool calls, tool results,
  permission requests, cost, and session id — over a new framed endpoint
  (`POST /v1/agent/stream`) instead of only text. `@xnetjs/devkit` exports the
  `AgentFrame` vocabulary, `foldStreamJsonFrames`, and `streamTurnFrames` on the
  Claude streaming agent; the existing OpenAI-compatible `/v1/chat/completions`
  endpoint is unchanged. The bridge session map can now be made durable
  (`fileSessionPersistence`) so `--resume` sessions survive a daemon restart, and
  `xnet bridge serve --agent claude` wires this automatically.

  `@xnetjs/plugins` adds a models.dev catalog consumer (`fetchModelsDevCatalog`,
  with a vendored snapshot fallback for offline/outage) for cloud-key and local
  model pickers, and now sends OpenRouter app-attribution headers
  (`HTTP-Referer` / `X-Title`) on OpenRouter-bound requests.

- [#620](https://github.com/crs48/xNet/pull/620) [`3aac04b`](https://github.com/crs48/xNet/commit/3aac04bd1de08d7cf7208eee47810f3973ffb2ff) Thanks [@crs48](https://github.com/crs48)! - Workspace writes from the bridged agent are now consent-gated. The devkit
  exports a read-only MCP tool tier (`XNET_READONLY_ALLOWED_TOOLS`) and
  `buildAgentArgs`/`buildStreamingAgentArgs` accept multiple allowed-tool
  patterns; `xnet bridge serve` defaults the agent to read-only workspace
  tools and requires `--allow-writes` to enable create/update/delete.

- [#620](https://github.com/crs48/xNet/pull/620) [`cd87b4d`](https://github.com/crs48/xNet/commit/cd87b4d5a462d2cee0eeea57b62df7147b0abe18) Thanks [@crs48](https://github.com/crs48)! - The local agent bridge now streams Claude Code replies live and carries
  conversations across turns. `cliStreamingChatAgent` drives Claude's
  `stream-json` headless mode with partial deltas forwarded as they arrive,
  the bridge maps conversations to CLI sessions (`--resume`) via transcript
  fingerprints, timeouts are idle-based instead of a 120s wall-clock cap, and
  chat turns run in a dedicated `~/.xnet/agent-home` working directory.
  Workspace tools (`--mcp`) are on by default for the Claude agent
  (`--no-mcp` opts out). New: `xnet bridge install` / `uninstall` manage a
  macOS launchd login item with a stable pairing code, and `xnet doctor`
  reports bridge daemon health.

- [#638](https://github.com/crs48/xNet/pull/638) [`77e2ac5`](https://github.com/crs48/xNet/commit/77e2ac5c7c3a3f7994d478277d2babb1e0c20607) Thanks [@crs48](https://github.com/crs48)! - Add `mcpHttpConfigFor` for pointing a coding agent at an already-running MCP
  server over Streamable HTTP, alongside the existing `mcpConfigFor` for servers
  the agent spawns itself. This is how a host application hands the agent its
  tools without shipping a CLI for it to launch: the app serves the workspace from
  its own process and passes the URL plus a pairing header.

- [#631](https://github.com/crs48/xNet/pull/631) [`6737116`](https://github.com/crs48/xNet/commit/67371169d213f0ac9388af9ae78e9ece8726b069) Thanks [@crs48](https://github.com/crs48)! - Add the point-and-change substrate from exploration 0399.

  `@xnetjs/devkit` gains `resolveLane()` (plus `workspaceOf`, `isKernel`,
  `lane3Prompt`) on a new browser-safe `./blast-radius` subpath, and the Lane 3
  preconditions `probeDevEnvironment`, `assertEditable`, `previewWorktree`, and
  `reviewWorktree`. `openPullRequest()` now opens a **draft** by default — pass
  `draft: false` for the previous behaviour.

  `@xnetjs/ui` exposes the theme token-override contract (`setThemeToken`,
  `clearThemeToken`, `clearThemeTokens`, `readTokenOverrides`,
  `applyTokenOverrides`) as plain functions usable outside `ThemeProvider`, and
  `useTheme()` gains `tokenOverrides` / `setToken` / `clearToken` / `clearTokens`.

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
