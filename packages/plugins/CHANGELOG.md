# @xnetjs/plugins

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
