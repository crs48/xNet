# @xnetjs/plugins

## 4.0.0

### Major Changes

- [#667](https://github.com/crs48/xNet/pull/667) [`e8843ef`](https://github.com/crs48/xNet/commit/e8843ef392fbc649cea796917ceb0ee0b57f06cf) Thanks [@crs48](https://github.com/crs48)! - Coding agents now get xNet's real retrieval, and a search that admits when it
  couldn't do its job.

  Every agent lane — the `xnet` CLI, `xnet mcp serve`, and the bridged agent
  inside the desktop app — previously built its AI surface with no retriever and
  fell back to a substring scan over the first 500 nodes, then rendered that
  result identically to an exhaustive search. All three now go through one
  `createAgentRetrieval()` construction path (enforced by a build guard), and
  `xnet search` leads with the tier it actually ran at, warning on stderr when it
  degraded.

  New: `xnet recall` and the `xnet_recall` MCP tool return a budgeted context pack
  where each hit carries the graph path it was reached by; `xnet serve` keeps the
  read path warm behind a unix socket; `xnet remember` / `forget` / `memories` /
  `distill` give the agent memory across sessions; and `api.recall` / `api.graph`
  let a sandboxed `xnet run` script reach past its loaded slice.

  **Breaking (`@xnetjs/plugins`)**: `AgentApi` gains required `recall` and `graph`
  methods and `AgentScriptSession` gains `getRequestedContext()` — implementors of
  those interfaces must update. `MCP_CORE_TOOL_NAMES` gains `xnet_recall`, and
  `XNET_AGENT_SKILL_MD` has been rewritten.

  **Breaking (`@xnetjs/cli`)**: `AgentCliServices` gains a required `retrieval`
  field, and `runSearch` output now begins with a `tier` provenance line — anything
  parsing its first line as the column header must skip it.

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

- [#712](https://github.com/crs48/xNet/pull/712) [`9c3db9c`](https://github.com/crs48/xNet/commit/9c3db9c0304c7585ab1163988ee8e8b6ab4875fc) Thanks [@crs48](https://github.com/crs48)! - Plugin composition runtime (exploration 0455): new `EffectScope` (nested, reverse-order, awaited disposal — `ExtensionContext.scope` backs `subscriptions`, and deactivation now awaits teardown) and `ServiceRegistry` (`provide`/`get`/`watch`/`inject` with availability semantics). `AiSurfaceService` and the MCP server resolve `agent-tools` providers live from a registry, so plugin-, connector-, and workspace-plugin-contributed tools reach every host — a plugin activating mid-session adds its tools to `tools/list` without a restart. `xnet mcp serve` (and the desktop agent bridge) now expose the `plugin_*` workspace-plugin tools. Manifests gain validated optional `provides`/`inject` service-name declarations; `Disposable.dispose` may now return a promise.

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

- [#629](https://github.com/crs48/xNet/pull/629) [`8a5fff7`](https://github.com/crs48/xNet/commit/8a5fff73e9a2dc44362193013ba6a84224894867) Thanks [@crs48](https://github.com/crs48)! - The in-app AI runtime can execute tools. `AiAgentRuntime` gains `tools`,
  `executeTool`, `allowedTools` and `maxToolSteps`: when a model asks for a tool
  the runtime runs it, feeds the result back as a `role: 'tool'` message, and
  asks again, bounded by `maxToolSteps`. The allow-list is enforced in code — a
  call outside it is refused before execution and reported back to the model —
  and a throwing tool becomes an error message the model can recover from rather
  than a failed turn. A new `tool.result` event carries each outcome.

  Without an `executeTool` the runtime behaves exactly as before: tool calls are
  recorded and never run.

- [#620](https://github.com/crs48/xNet/pull/620) [`705e9b7`](https://github.com/crs48/xNet/commit/705e9b7610b97b5f84c6329db5acf9bb04d11b61) Thanks [@crs48](https://github.com/crs48)! - AI retrieval now uses the FTS5 index instead of scanning. `NodeStore` (and
  the storage adapter contract) gain an optional `searchText(query, limit)`
  that runs a cross-schema BM25 search over `nodes_fts`; the AI surface's
  `search` tool prefers it and falls back to the substring scan only when the
  storage has no FTS support.

- [#629](https://github.com/crs48/xNet/pull/629) [`8f46d59`](https://github.com/crs48/xNet/commit/8f46d59e4bf00629803a56a86407c977a7a7162d) Thanks [@crs48](https://github.com/crs48)! - Schema-scoped AI search now returns a full page of results. `searchNodes` and
  `NodeStore.searchText` accept an optional `schemaId` that is pushed into the
  FTS5 query (joining `nodes`, excluding soft-deleted rows) instead of being
  applied to a cross-schema BM25 window afterwards — previously a scoped search
  could come back nearly empty whenever that schema's matches ranked below the
  window.

  The AI `search` tool also reports how it matched: results carry `index`
  (`'fts5'` or `'scan'`), `degraded`, and a `notice` when the full-text index was
  unavailable, so an agent can tell a substring scan over a truncated window from
  an exhaustive search rather than concluding a node does not exist.

- [#637](https://github.com/crs48/xNet/pull/637) [`4d85c64`](https://github.com/crs48/xNet/commit/4d85c6435e55f6729f51621612e467be37eb70aa) Thanks [@crs48](https://github.com/crs48)! - `xnet_query` and `xnet_create` now honour the `schemaId` argument. Both tools
  read `schemaId` first and keep `schema` as a deprecated alias — previously they
  read only `schema`, so an MCP client that passed `schemaId` (the field name
  every node carries) had its filter dropped: `xnet_query` fell through to an
  unfiltered `store.list` and answered "my pages" with nodes of every schema,
  while `xnet_create` could mint a node with no schema at all.

  A call that supplies neither spelling now fails with a clear error instead of
  widening to every node.

- [#665](https://github.com/crs48/xNet/pull/665) [`730d30a`](https://github.com/crs48/xNet/commit/730d30a117ff20192a6e1a257ba544a8945cfe36) Thanks [@crs48](https://github.com/crs48)! - Parked agent approvals are now reachable by the host.

  `AgentAuditRecorder` decides whether a call needs a human but does not hold the
  call open while one is found, and `approveFromApp` had no caller outside the
  in-app AI panel. A high or critical action from any other surface — a bridged
  coding agent, an MCP client — therefore parked where nothing could release it
  and expired silently.
  - New `createApprovalBroker(recorder, options)` (exported from the root barrel):
    headless park/settle over a recorder, with a change subscription. `maxWaitMs`
    bounds how long a caller waits without un-parking the action, so a transport
    timeout never looks like a decision.
  - `MCPServer` configured with `agentAudit` now **parks** medium+ risk tool
    calls instead of returning a pending payload, so an approval resumes the
    agent's turn with the real result. New `listParkedApprovals()`,
    `onParkedApprovalsChanged()`, `approveParkedApproval(actionId, approverDID)`
    and `denyParkedApproval(actionId)` give the host the release path that
    high/critical actions require by design.
  - `agentAudit` accepts `approvalWaitMs` (default 55s) alongside `approvalTtlMs`.
  - `createAgentCeremonyTools(recorder, broker?)` takes the broker so a relayed
    `APPROVE <code>` settles the parked call rather than applying the action
    beside a caller still waiting.

  Behaviour change for embedders: with `agentAudit` configured, a medium+ risk
  `tools/call` no longer resolves immediately with `{ pending: true }`. It
  resolves when the operator decides, or — after `approvalWaitMs` — with a
  still-pending payload that leaves the action parked.

- [#687](https://github.com/crs48/xNet/pull/687) [`2bf556b`](https://github.com/crs48/xNet/commit/2bf556b48264f129230b5b7bd99969c03c37141d) Thanks [@crs48](https://github.com/crs48)! - Retrieval now reports how it searched, not just what it found.

  `WorkspaceRetrieval.retrieveContext` returns `{ nodes, provenance }` instead of
  a bare node array — a **breaking** change for direct callers, who previously
  got the nodes and no way to learn that the search had fallen back to a bounded
  substring scan. Use `result.nodes` where you used the array, and
  `result.provenance` for the tier, the `degraded` flag and a printable notice.

  On the `@xnetjs/plugins` side everything is additive: `AiContextRetriever`
  accepts either shape, `AiContextPack` gained an optional `retrieval` field, and
  a resource's `citation` gained the optional `path` the retriever had always
  computed and the pack had always dropped.

  `SCAN_NOTICE` is now exported from `@xnetjs/brain` so every lane warns in the
  same words.

### Patch Changes

- [#621](https://github.com/crs48/xNet/pull/621) [`ff622ad`](https://github.com/crs48/xNet/commit/ff622adf3cc8abe844850d39dbe77ef7f111cb62) Thanks [@crs48](https://github.com/crs48)! - Correct the deployed web app's origin in the agent-bridge origin examples: the
  PWA lives at `https://xnet.fyi/app`, so the origin to allow is
  `https://xnet.fyi` — not the nonexistent `app.xnet.fyi`. Updates `xnet bridge
serve|install --allow-origin` help text and the `appOrigin` doc example.

- [#627](https://github.com/crs48/xNet/pull/627) [`63a417b`](https://github.com/crs48/xNet/commit/63a417b21a94224eb33e0c3cbac45aa74004d310) Thanks [@crs48](https://github.com/crs48)! - Use xNet from inside a coding agent (exploration 0393). A new
  `xnet connect claude-code|codex` command wires a coding agent to the workspace
  in one idempotent step: it installs the agent skill, registers the `xnet` MCP
  server (read-only by default, `--writes` to enable), writes a `CLAUDE.md`/
  `AGENTS.md` contract, and can bootstrap a scoped vault checkout. It ships a
  first-party Claude Code plugin (`packages/cli/plugin/`) whose bundled skill is
  kept byte-identical to `xnet skill` by a CI guard.

  The agent verbs (`checkout`/`status`/`commit`/`search`/`query`/`db`/`daemon`)
  now resolve a backend automatically instead of hard-requiring the running app:
  they probe the local API and otherwise fall back to a standalone SQLite store
  via `--db`/`$XNET_DB` or a discovered data directory. New `--db`/`--agent`/
  `--key` flags select the store and signing identity; local writes refuse a
  silent ephemeral identity. `xnet doctor --agent-access` reports backend,
  full-text search, and identity reachability, and `xnet mcp serve` gains a
  `--read-only` mode (also `$XNET_READONLY=1`).

  `@xnetjs/plugins` refreshes the agent `SKILL.md` with an explicit CLI-first lane
  hierarchy, scoped-checkout guidance, and write-consent rules.

- Updated dependencies [[`e8843ef`](https://github.com/crs48/xNet/commit/e8843ef392fbc649cea796917ceb0ee0b57f06cf), [`2c148e8`](https://github.com/crs48/xNet/commit/2c148e8f134b0062ea9bca7af888710834f1ad91), [`705e9b7`](https://github.com/crs48/xNet/commit/705e9b7610b97b5f84c6329db5acf9bb04d11b61), [`8f46d59`](https://github.com/crs48/xNet/commit/8f46d59e4bf00629803a56a86407c977a7a7162d), [`06fb240`](https://github.com/crs48/xNet/commit/06fb240fc7ecf55b6364395602c1d906d4e2255c), [`c021369`](https://github.com/crs48/xNet/commit/c0213690a1342b8b5fc1605c9b4f3b7c1057b614), [`cd22c25`](https://github.com/crs48/xNet/commit/cd22c2530fb75cf7c16387e3e56abc9d2a8b5c39), [`f357971`](https://github.com/crs48/xNet/commit/f357971de9d325aeb31520631cec8339dfc94e7c), [`44a4ce0`](https://github.com/crs48/xNet/commit/44a4ce0f4423a74e230e17e01eb00232afccdcd7), [`921d2c8`](https://github.com/crs48/xNet/commit/921d2c81f96a983bf8f26445a235e63024498c2d), [`e5a940c`](https://github.com/crs48/xNet/commit/e5a940c5acaf94c98492e48d2a142f47a754b8a8), [`561e8e5`](https://github.com/crs48/xNet/commit/561e8e55dbbf44040b817d65a316a8dd39ee76cf), [`5c9112f`](https://github.com/crs48/xNet/commit/5c9112fb56a524106d3081f042ef7ea658cdbb84), [`184709a`](https://github.com/crs48/xNet/commit/184709af1ddb235b32130f45ab6d859aa4a882e4), [`2bf556b`](https://github.com/crs48/xNet/commit/2bf556b48264f129230b5b7bd99969c03c37141d)]:
  - @xnetjs/data@4.0.0
  - @xnetjs/brain@1.0.0
  - @xnetjs/abuse@4.0.0
  - @xnetjs/core@4.0.0

## 3.0.0

### Minor Changes

- [#564](https://github.com/crs48/xNet/pull/564) [`a4097e5`](https://github.com/crs48/xNet/commit/a4097e58bf568a19a737ce78783838913fd89fc3) Thanks [@crs48](https://github.com/crs48)! - Workspace layout presets drop the retired shell views (exploration
  0353): `createDefaultTree` and the `bench` preset no longer place the
  `sidebar` / `rail` slot views (both deleted — the shipping shell renders
  its own sidebar islands), and the default tree's left dock now leads
  with the unified `tree` view. The `rail` region remains as a placement
  target for user-moved views.

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

- [#565](https://github.com/crs48/xNet/pull/565) [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6) Thanks [@crs48](https://github.com/crs48)! - Spell the brand `xNet` consistently in user-visible copy

  The repo had drifted between `xNet` and `XNet` in prose. Everything a
  consumer can read now uses the lowercase-x, uppercase-N form.
  - `@xnetjs/plugins`: the managed AI provider's display name is now
    `'xNet Cloud'` (was `'XNet Cloud'`), along with its connector label and
    setup hints. Cosmetic — the managed tier is selected by its `'managed'`
    id, not by this string, and nothing persists it.
  - `@xnetjs/cli`: `xnet bridge` help text and its pairing instructions.
  - `@xnetjs/slack-compat`: published package description.

  No exported names, signatures, or wire contracts changed. Code identifiers
  (`XNetProvider`, `useXNet`, `XNetKit`) keep their existing casing.

- Updated dependencies [[`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6), [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe), [`33f4b9e`](https://github.com/crs48/xNet/commit/33f4b9ef38c72b2e898f7a4a4de83cc08b0aea88), [`0edfbee`](https://github.com/crs48/xNet/commit/0edfbeefb6b7cf50c0f6a4c2a638bfe5d79ce6ce), [`e48eb34`](https://github.com/crs48/xNet/commit/e48eb345832db3fab41dd7e3ac70a08f8c86c343), [`22892a6`](https://github.com/crs48/xNet/commit/22892a674e2dc3ae7a86ac81d6c20de559b852ed), [`0f26bc9`](https://github.com/crs48/xNet/commit/0f26bc96b9261a8ee0589d94dd276c78017dcc1a), [`60337df`](https://github.com/crs48/xNet/commit/60337dfa61ab7afaa5768169d1a89e7398827b6c), [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6), [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6)]:
  - @xnetjs/abuse@3.0.0
  - @xnetjs/core@3.0.0
  - @xnetjs/data@3.0.0
  - @xnetjs/slack-compat@0.0.3
  - @xnetjs/trust@0.0.3

## 2.5.0

### Minor Changes

- [#552](https://github.com/crs48/xNet/pull/552) [`c7ef045`](https://github.com/crs48/xNet/commit/c7ef0456bfc75b5813d8a9d34f465f13a1e088ae) Thanks [@crs48](https://github.com/crs48)! - Composable UI frames (exploration 0346). The `@xnetjs/editor` and
  `@xnetjs/views` surfaces are release-ignored packages; their changes ship
  with the app. Live embeds in documents (Phase 1): `databaseEmbed` blocks
  now pass any registry view type through to the host (map, timeline, plugin
  views — not just the built-in six), `pageEmbed` blocks render a host-provided
  live summary transclusion via the new `renderPageEmbed` host callback, and the
  slash menu gains a `/view of…` command backed by the new
  `onSelectDatabaseView` host picker. Adds `extractDocPreviewLines` for
  summary-tier text extraction from a v4 document fragment.

  `@xnetjs/views` gains the Frame contract (0346 Phase 2): `FrameDef` /
  `FrameSource` / `FrameTier`, the `FrameRenderer` + `frameSourceRegistry`
  (schema-dispatched node frames, saved-query frames, curated collection
  frames, depth-clamped transclusion), container adapters
  (`frameFromDatabaseEmbed` / `frameFromPageEmbed` / `frameFromCanvasNode`),
  and the generic dashboard frame widget (`registerFrameWidget`).

  `@xnetjs/react` gains the entangle bus (0346 Phase 3): `EntangleProvider`
  / `useEntangledHighlight` / `useEntangleBind` — page-scoped hover/select
  co-presence so frames on one page (grid rows, board cards, calendar
  chips, map pins, wikilink chips) highlight the same node together.
  `ReverseRelationsPanel` gains an `onOpenAsFrame` action.

  `@xnetjs/plugins` (0346 Phase 5): new agent tools
  `xnet_plan_frame_placement` / `xnet_apply_frame_placement` /
  `xnet_compose_page` — the agent composes pages of live frames through
  the standard plan → validate → apply pipeline (declarative tier only).
  Plugins gain `registerFrameRenderer` with the own-views-only namespacing
  rule.

  `@xnetjs/data` (0346 Phase 5): cross-node formula scope — `RELATED()`
  and `NODE()` context functions widen the one formula language from row →
  relations → named nodes (host-resolved, cache-bypassed until 0317's
  precise invalidation). Pages gain an additive
  `geometry: stack | grid | space` property (default `stack`).

### Patch Changes

- Updated dependencies [[`c7ef045`](https://github.com/crs48/xNet/commit/c7ef0456bfc75b5813d8a9d34f465f13a1e088ae)]:
  - @xnetjs/data@2.5.0
  - @xnetjs/abuse@2.5.0
  - @xnetjs/core@2.5.0

## 2.4.0

### Patch Changes

- Updated dependencies [[`1c7b9c9`](https://github.com/crs48/xNet/commit/1c7b9c9c3804fc0d4c80b032ae0ebc0163714c52)]:
  - @xnetjs/data@2.4.0
  - @xnetjs/abuse@2.4.0
  - @xnetjs/core@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [[`e2ec439`](https://github.com/crs48/xNet/commit/e2ec43932ec3b05e74765a537ae9b94a219c7c36), [`735d491`](https://github.com/crs48/xNet/commit/735d491217a964c5210140ac58925db0ecdd765e), [`d246195`](https://github.com/crs48/xNet/commit/d2461957723cc4c9e6366192670127f8bd1d458d), [`3ea44c6`](https://github.com/crs48/xNet/commit/3ea44c6354e3f55443d3c3b49d8ca1f9c0941987)]:
  - @xnetjs/data@2.3.0
  - @xnetjs/abuse@2.3.0
  - @xnetjs/core@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [[`2962c28`](https://github.com/crs48/xNet/commit/2962c28afd0b5c15ce42ee1b42e58e6c55868d5a)]:
  - @xnetjs/data@2.2.0
  - @xnetjs/abuse@2.2.0
  - @xnetjs/core@2.2.0

## 2.1.0

### Minor Changes

- [#533](https://github.com/crs48/xNet/pull/533) [`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708) Thanks [@crs48](https://github.com/crs48)! - Agent Passports and signed agent audit trails (exploration 0337).
  - `@xnetjs/data`: new agent schema pack — `AgentPassport`, `AgentSession`,
    `AgentAction`, `AgentApproval`, `AgentNotification` — with deterministic id
    helpers (`agentActionId`, …) and `redactInstruction`.
  - `@xnetjs/identity`: `mintAgentPassport` / `verifyAgentPassport` (per-agent
    `did:key` + operator-delegated, attenuation-checked UCAN; wildcards
    rejected) and `rootIssuers` for delegation-chain root inspection.
  - `@xnetjs/plugins`: `AgentAuditRecorder` wraps the AI surface so every tool
    call lands as an `AgentAction` node and medium+ risk calls park behind a
    risk-tiered approval ceremony (chat nonce with TTL for medium; xNet-surface
    only for high/critical); ceremony tools (`xnet_approve`, `xnet_deny`,
    `xnet_pending_approvals`, `xnet_undo`) and the `xnet_poll_notifications`
    outbox tool; `MCPServerConfig.agentAudit` wires it into the MCP server;
    `NodeStoreAPI.create` now accepts an optional deterministic `id`; new AI
    scopes `agent.approve` and `agent.notifications`.
  - `@xnetjs/cli`: `xnet agent enroll <name>` mints and stores passports
    (`~/.xnet/agents`, 0600) and prints OpenClaw/Hermes config; `xnet mcp serve
--agent <name> [--db <path>]` serves an agent-scoped session over an
    agent-signed local store.

- [#525](https://github.com/crs48/xNet/pull/525) [`fa93e2f`](https://github.com/crs48/xNet/commit/fa93e2f7177367e7336f6a825f8c3436a2165833) Thanks [@crs48](https://github.com/crs48)! - Add the workspace-plugin runtime (exploration 0331): author, hot-load, and
  compose plugins whose source lives in the workspace as a `PluginSource` node.
  New public surface: `PluginSourceSchema` + `readPluginSourceNode`, an in-browser
  module builder (`buildPluginModuleGraph`) with a pinned import map, the
  `SandboxedPluginHost` (`activateWorkspacePlugin`) that loads plugin code only in
  an opaque-origin iframe and registers data-declared contributions over
  MessagePort RPC, a gated store RPC (`createPluginStoreRpc`, denylist-wins), a
  250ms-debounce hot reloader (`createWorkspacePluginHotReloader`), content-hash
  pinning + drift diffing (`computePluginSourceHash`, `assessPluginUpdate`), the
  `plugin_*` agent tools (`createWorkspacePluginAgentTools`) and the
  `WRITING_XNET_PLUGINS_SKILL_MD` authoring skill, and both publish paths
  (`requestWorkspacePluginPublish`, `buildCommunityRegistryEntry`). `MCPServerConfig`
  gains an `extraTools` field to expose the new tools beside the built-ins.

### Patch Changes

- Updated dependencies [[`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708)]:
  - @xnetjs/data@2.1.0
  - @xnetjs/abuse@2.1.0
  - @xnetjs/core@2.1.0

## 2.0.0

### Major Changes

- [#496](https://github.com/crs48/xNet/pull/496) [`6a5a15e`](https://github.com/crs48/xNet/commit/6a5a15e5d7693f54a0c859b1f096dc6405694574) Thanks [@crs48](https://github.com/crs48)! - AI page-markdown surface re-targeted to the BlockNote editor (exploration 0312).
  - **Breaking**: the page-markdown apply adapter mode `'tiptap-yjs'` is renamed
    to `'blocknote-yjs'` in `AiPageMarkdownApplyAdapterResult['mode']` and
    `AiPageMarkdownApplyResult['mode']`. Adapters that returned
    `mode: 'tiptap-yjs'` must return `'blocknote-yjs'` (or `'yjs'`/`'custom'`).
  - New Yjs-fragment ↔ markdown conversion for BlockNote (`content-v4`)
    documents, dependency-light (walks the Yjs XML tree directly, no editor/DOM):
    - `xnetPageFragmentToMarkdown(doc)` reads the BlockNote fragment
      (paragraph/heading/lists/check items/code/quote/callout/table + inline
      `mention`/`hashtag`/`wikilink`/`inlineMath` atoms), falling back to the
      legacy TipTap `content` fragment when `content-v4` is empty
      (`blockNoteFragmentToMarkdown` / `legacyFragmentToMarkdown` are also
      exported).
    - `replaceXNetPageFragmentWithMarkdown(doc, markdown)` writes the AI
      markdown subset (paragraphs, headings, bullet/numbered/check lists with
      nesting, fenced code, quotes, callouts, wikilinks) as BlockNote PM XML —
      `blockGroup > blockContainer` (unique `id` per block) wrappers — in one
      Yjs transaction.
    - `createBlockNotePageMarkdownAdapter({ resolveDoc })` packages both as an
      `AiPageMarkdownApplyAdapter` (plus `readMarkdown`) for
      `xnet_apply_page_markdown`, replacing the TipTap-era document bridge.
    - `XNET_PAGE_FRAGMENT_FIELD` (`'content-v4'`) and
      `XNET_PAGE_LEGACY_FRAGMENT_FIELD` (`'content'`) constants.
  - `@xnetjs/plugins` now depends on `yjs`; the unused `@tiptap/core`
    devDependency is gone.

- [#496](https://github.com/crs48/xNet/pull/496) [`2a7b80f`](https://github.com/crs48/xNet/commit/2a7b80f613d1c7b5db637639d4a3176df23ae1f3) Thanks [@crs48](https://github.com/crs48)! - `EditorContribution` carries BlockNote specs instead of TipTap extensions (exploration 0312).
  - **Breaking**: `EditorContribution.extension` (TipTap `Extension`) and
    `EditorContribution.toolbar` (`ToolbarContribution`, removed entirely) are
    gone. Plugins now contribute `blockSpecs` / `inlineContentSpecs` /
    `styleSpecs` (opaque BlockNote spec objects keyed by spec name) plus
    behavior-only `slashMenuItems`.
  - **Breaking**: the editor schema-skew guard is spec-based —
    `isSchemaDefiningExtension` is replaced by `isSchemaDefiningContribution`,
    and `findEditorSchemaRisks` / `warnOnEditorSchemaRisks` take the host's
    statically bundled spec names and flag any contributed spec outside that
    set (0205 invariant: schema specs must be identical across all
    collaborators or Yjs silently drops content).
  - `SlashCommandContext.editor` is now a BlockNote editor instance.
  - The `@tiptap/core` dependency is removed.

### Patch Changes

- Updated dependencies [[`85c9700`](https://github.com/crs48/xNet/commit/85c9700d6de11459f39083a1824f9cbf79cdb7bd), [`a91f278`](https://github.com/crs48/xNet/commit/a91f278ac122c588145ebb5f3981f6745b30ba66), [`dd956e5`](https://github.com/crs48/xNet/commit/dd956e512b60f3b4288ae4fb0cb2ade875da1f9f), [`e4cb876`](https://github.com/crs48/xNet/commit/e4cb876cc49fcf94a71d015dd60683ff038b367c), [`e2e78cd`](https://github.com/crs48/xNet/commit/e2e78cd319723972591e1aae9d87af4588edfda3), [`0f7ef43`](https://github.com/crs48/xNet/commit/0f7ef435afab91022433ae6c60c3a71510a1d036)]:
  - @xnetjs/data@2.0.0
  - @xnetjs/abuse@2.0.0
  - @xnetjs/core@2.0.0

## 1.0.0

### Patch Changes

- [#483](https://github.com/crs48/xNet/pull/483) [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c) Thanks [@crs48](https://github.com/crs48)! - docs(exploration): renumber Effect adoption doc 0300 -> 0303 (collision)

  Exploration numbers collided across parallel worktrees again (0301 gotcha):
  0300 was already taken by RUNNING_AN_XNET_HUB_ON_A_RASPBERRY_PI ([#477](https://github.com/crs48/xNet/issues/477)) and
  0301/0302 are claimed. Renames the doc and updates the exploration-number
  references in code comments and CLAUDE.md; no code change (empty changeset).

  Signed-off-by: xNet Test <test@xnet.dev>

- Updated dependencies [[`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174), [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c), [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28)]:
  - @xnetjs/core@1.0.0
  - @xnetjs/data@1.0.0
  - @xnetjs/abuse@1.0.0

## 0.12.0

### Patch Changes

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

- Updated dependencies [[`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141)]:
  - @xnetjs/core@0.12.0
  - @xnetjs/data@0.12.0
  - @xnetjs/abuse@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.11.1
  - @xnetjs/abuse@0.11.1
  - @xnetjs/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [[`d9cd478`](https://github.com/crs48/xNet/commit/d9cd478e554e3bb5de6f6c58c3d1550143bdd31a)]:
  - @xnetjs/data@0.11.0
  - @xnetjs/abuse@0.11.0
  - @xnetjs/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7)]:
  - @xnetjs/data@0.10.0
  - @xnetjs/abuse@0.10.0
  - @xnetjs/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852)]:
  - @xnetjs/data@0.9.0
  - @xnetjs/abuse@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Minor Changes

- [#420](https://github.com/crs48/xNet/pull/420) [`dd3b1cb`](https://github.com/crs48/xNet/commit/dd3b1cb270386b243afe0ba28e8e2a55c9ff2726) Thanks [@crs48](https://github.com/crs48)! - Single-shell layout primitives (exploration 0284): `createDefaultTree()` and `DEFAULT_WORKSPACE_ID` join the workspace layout API — the one canonical tree (a sectioned sidebar in the rail, the full left dock, tabs on) that replaces the quiet/calm/bench preset trichotomy. Purely additive: `createPresetTree` and the preset ids remain for the devtools seed and portable-workspace round-trips.

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

- Updated dependencies []:
  - @xnetjs/data@0.8.0
  - @xnetjs/abuse@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Minor Changes

- [#412](https://github.com/crs48/xNet/pull/412) [`a5813fc`](https://github.com/crs48/xNet/commit/a5813fc432fcb44cad0caba72d8bfcb065bf5dec) Thanks [@crs48](https://github.com/crs48)! - `insertSlot(tree, viewId, region, index)` joins the workspace layout primitives (exploration 0282): positional insertion for within-dock reorders and cross-region moves; `moveSlot` is now insert-at-end. Purely additive.

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.7.0
  - @xnetjs/abuse@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Minor Changes

- [#409](https://github.com/crs48/xNet/pull/409) [`6795f6b`](https://github.com/crs48/xNet/commit/6795f6b0e89c225cfa7892119ab63d6a04226b8f) Thanks [@crs48](https://github.com/crs48)! - Generalize the SurfaceDock contract into shell-wide slot contributions (exploration 0280). New `SlotContribution` type (with `defaultRegion` / `allowedRegions`), `SlotRegion` union, a `slots` registry on `ContributionRegistry`, a `slots` key on `PluginContributions`, and `ExtensionContext.registerSlotView()`. `SurfaceDockContribution` and the `surfaceDock` registry remain as deprecated aliases — no breaking changes.

- [#409](https://github.com/crs48/xNet/pull/409) [`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025) Thanks [@crs48](https://github.com/crs48)! - Workspaces as nodes (exploration 0280): new `xnet:Workspace` schema in `@xnetjs/data` (name/preset/system/tree — the portable half of a saved shell layout), and workspace layout primitives in `@xnetjs/plugins` (`LayoutTree`, `createPresetTree`, `moveSlot`/`setSlotTier`, `parseWorkspacePayload`/`serializeWorkspacePayload`) shared by the web shell, the seed, and future desktop adoption.

### Patch Changes

- Updated dependencies [[`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025)]:
  - @xnetjs/data@0.6.0
  - @xnetjs/abuse@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Minor Changes

- [#407](https://github.com/crs48/xNet/pull/407) [`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c) Thanks [@crs48](https://github.com/crs48)! - Botless meeting transcription foundations (exploration 0279).

  `@xnetjs/data`: new `Meeting@1.0.0` (Yjs notes body, Page-like, private by default) and `MeetingTranscript@1.0.0` (channel-attributed timed segments, FTS full text, engine provenance, opt-in audio blob reference) schemas, plus `MeetingSegment`/`MeetingChannel`/`MeetingTemplateId` types.

  `@xnetjs/plugins`: new `systemAudio` module capability (closed by default; gates desktop system-audio capture, renders as a danger consent line) with `isSystemAudioAllowed`/`assertSystemAudio` guards, and a Google Calendar connector (`buildGoogleCalendarConnector`, `detectUpcomingMeeting`) that materializes upcoming events as Meeting nodes.

### Patch Changes

- Updated dependencies [[`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c)]:
  - @xnetjs/data@0.5.0
  - @xnetjs/abuse@0.5.0
  - @xnetjs/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204)]:
  - @xnetjs/data@0.4.0
  - @xnetjs/abuse@0.4.0
  - @xnetjs/core@0.4.0

## 0.3.0

### Patch Changes

- [#401](https://github.com/crs48/xNet/pull/401) [`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed) Thanks [@crs48](https://github.com/crs48)! - Add the shared Last-Write-Wins ordering module to `@xnetjs/core`
  (`compareChangeApplicationOrder`, `compareLwwStamps`, `lwwWins`,
  `lwwUpdateGuardSql`, `LwwStamp`) — the single canonical LWW comparison used
  across the stack (protocol §L1.7).

  `@xnetjs/data`, `@xnetjs/plugins`, and `@xnetjs/react` adopt it and receive
  internal decompositions of their most-churned modules (NodeStore query
  compiler/hydration/transaction execution, ai-surface tool registry and
  resource URI router, XNetProvider provider units). No public API changes in
  those packages.

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/data@0.3.0
  - @xnetjs/abuse@0.3.0

## 0.2.0

### Minor Changes

- [#395](https://github.com/crs48/xNet/pull/395) [`7928202`](https://github.com/crs48/xNet/commit/792820204f71b8943f9e601f5edb3a68f86e48f5) Thanks [@crs48](https://github.com/crs48)! - Add the `surfaceDock` contribution point (exploration 0273): plugins can register `SurfaceDockContribution` panels (`tier: 'hero' | 'secondary'`, group, keywords, badge) that the quiet shell's bottom-right dock launcher renders — the devtools hero/secondary grammar lifted to an app-level registry.

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.2.0
  - @xnetjs/abuse@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc), [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/data@0.1.2
  - @xnetjs/abuse@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/data@0.1.1
  - @xnetjs/abuse@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Minor Changes

- [#291](https://github.com/crs48/xNet/pull/291) [`acbf801`](https://github.com/crs48/xNet/commit/acbf801aeec7f958bd953a9f3d98cc355a0387db) Thanks [@crs48](https://github.com/crs48)! - AI assist now defaults to a "scaffold" mode that keeps you the author — the model
  proposes and cites, you write and own — as a guard against LLM deskilling
  (Humane Internet Charter §Agency). Every assistant turn is tagged with
  `ai-generated` provenance and the mode it was produced under, and a new
  `composeAssistSystemPrompt` helper appends the cognitive-debt guard in scaffold
  mode. `draft` mode (the model writes finished prose) must be opted into
  explicitly via `assistMode: 'draft'`.

- [#349](https://github.com/crs48/xNet/pull/349) [`1a44c5d`](https://github.com/crs48/xNet/commit/1a44c5decb087cfbf44e152d811a51f953893036) Thanks [@crs48](https://github.com/crs48)! - Connector detection now reports the in-tab AI tiers as available only when they
  can actually run, fixing a chat composer that stayed disabled with no
  explanation. `webllm` is gated on a new `ConnectorEnv.hasWebLLMEngine` probe (in
  addition to WebGPU) so it's never advertised without a host-supplied engine, and
  the default `prompt-api` probe now reads `LanguageModel.availability()` and
  treats only `'available'` as ready (mere API presence with a `'downloadable'`
  model no longer counts). Adds `promptApiAvailability()` (raw state, for offering
  a download gesture) and `downloadPromptApiModel()` (gesture-driven, monitored
  download), plus the `PromptApiAvailability` and `LanguageModelMonitor` types.

- [#316](https://github.com/crs48/xNet/pull/316) [`2a638ec`](https://github.com/crs48/xNet/commit/2a638ec81145eb89f156ca5275227412680df898) Thanks [@crs48](https://github.com/crs48)! - The managed XNet Cloud AI provider (`ManagedProvider`) now supports **streaming**.
  It implements `stream()` over the new `/ai/chat/stream` SSE endpoint — yielding
  text deltas as they arrive and reporting the live budget from the terminal event —
  and its capabilities now advertise `streaming: true`. A pre-stream `402` or an
  `ai_budget_exceeded` event surfaces as a typed `AiBudgetError`, same as the unary
  path. Non-streaming callers are unaffected.

- [#293](https://github.com/crs48/xNet/pull/293) [`3c8a6a6`](https://github.com/crs48/xNet/commit/3c8a6a61c56eadc8f0b8657ce8a241981f7e7dc4) Thanks [@crs48](https://github.com/crs48)! - Add the Right to Leave service (Humane Internet Charter §Exit): `leaveWithEverything`
  bundles your whole workspace, your portable did:key identity, and a re-import
  README into one archive, and `deleteDay` tombstones remote copies and (optionally)
  wipes the local master — emitting only an anonymous `account.left` signal. Leaving
  takes everything and loses nothing, with no confirmshaming.

### Patch Changes

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

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/abuse@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`6183829`](https://github.com/crs48/xNet/commit/618382920002a39f00e4f5f4a2ae604c2aef4fa6)]:
  - @xnetjs/trust@0.0.2
  - @xnetjs/slack-compat@0.0.2
  - @xnetjs/data@0.0.3
  - @xnetjs/abuse@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/core@0.0.2
  - @xnetjs/data@0.0.2
