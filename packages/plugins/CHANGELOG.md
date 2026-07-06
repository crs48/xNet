# @xnetjs/plugins

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
