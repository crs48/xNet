# @xnetjs/plugins

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
