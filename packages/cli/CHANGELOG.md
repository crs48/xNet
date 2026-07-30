# @xnetjs/cli

## 0.4.0

### Minor Changes

- [#575](https://github.com/crs48/xNet/pull/575) [`60337df`](https://github.com/crs48/xNet/commit/60337dfa61ab7afaa5768169d1a89e7398827b6c) Thanks [@crs48](https://github.com/crs48)! - Add the publishing spine (exploration 0362).

  `@xnetjs/data` gains a `Publication` schema and publishing fields on `Page`
  (`publication`, `slug`, `excerpt`, `publishedAt`, `canonicalUrl`,
  `publishedFrontier`). A post is a Page with editorial metadata rather than a
  new document type, and `publishedAt` absence is what makes a post a draft.

  `@xnetjs/cli` gains `xnet publish static`, which renders a publication to a
  self-contained static site — HTML, RSS, sitemap and robots.txt — servable from
  any static host with no hub in the read path.

  Both changes are additive: no exports were removed or renamed, and every new
  `Page` property is optional, so existing pages are unaffected.

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

- Updated dependencies [[`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6), [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe), [`215d61d`](https://github.com/crs48/xNet/commit/215d61d586048c7d7d2221947bdcde7966172907), [`33f4b9e`](https://github.com/crs48/xNet/commit/33f4b9ef38c72b2e898f7a4a4de83cc08b0aea88), [`0edfbee`](https://github.com/crs48/xNet/commit/0edfbeefb6b7cf50c0f6a4c2a638bfe5d79ce6ce), [`e48eb34`](https://github.com/crs48/xNet/commit/e48eb345832db3fab41dd7e3ac70a08f8c86c343), [`22892a6`](https://github.com/crs48/xNet/commit/22892a674e2dc3ae7a86ac81d6c20de559b852ed), [`ee9f4dc`](https://github.com/crs48/xNet/commit/ee9f4dcb66d52edcf73216a03b068de8555e57d7), [`437699c`](https://github.com/crs48/xNet/commit/437699c62255b1bcf24d7a8739fef0a7b530b702), [`0f26bc9`](https://github.com/crs48/xNet/commit/0f26bc96b9261a8ee0589d94dd276c78017dcc1a), [`60337df`](https://github.com/crs48/xNet/commit/60337dfa61ab7afaa5768169d1a89e7398827b6c), [`a4097e5`](https://github.com/crs48/xNet/commit/a4097e58bf568a19a737ce78783838913fd89fc3), [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6), [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6)]:
  - @xnetjs/core@3.0.0
  - @xnetjs/crypto@3.0.0
  - @xnetjs/data@3.0.0
  - @xnetjs/devkit@1.0.1
  - @xnetjs/identity@3.0.0
  - @xnetjs/plugins@3.0.0
  - @xnetjs/runtime@0.6.0
  - @xnetjs/sqlite@3.0.0
  - @xnetjs/sync@3.0.0
  - @xnetjs/publish@0.1.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`c7ef045`](https://github.com/crs48/xNet/commit/c7ef0456bfc75b5813d8a9d34f465f13a1e088ae)]:
  - @xnetjs/plugins@2.5.0
  - @xnetjs/data@2.5.0
  - @xnetjs/runtime@0.5.5
  - @xnetjs/sqlite@2.5.0
  - @xnetjs/sync@2.5.0
  - @xnetjs/identity@2.5.0
  - @xnetjs/crypto@2.5.0
  - @xnetjs/core@2.5.0

## 0.3.0

### Minor Changes

- [#545](https://github.com/crs48/xNet/pull/545) [`7bb5f80`](https://github.com/crs48/xNet/commit/7bb5f809da96e3cb7bea2c31569e388371c1b1ee) Thanks [@crs48](https://github.com/crs48)! - New `xnet data export` (full/space/schema/node scope, incremental
  `--since-lamport`), `xnet data import` (with `--dry-run` verify report),
  and `xnet data snapshot --sqlite` (VACUUM INTO) commands for `.xnetpack`
  bundle portability.

### Patch Changes

- Updated dependencies [[`1c7b9c9`](https://github.com/crs48/xNet/commit/1c7b9c9c3804fc0d4c80b032ae0ebc0163714c52)]:
  - @xnetjs/data@2.4.0
  - @xnetjs/plugins@2.4.0
  - @xnetjs/runtime@0.5.4
  - @xnetjs/sqlite@2.4.0
  - @xnetjs/sync@2.4.0
  - @xnetjs/identity@2.4.0
  - @xnetjs/crypto@2.4.0
  - @xnetjs/core@2.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`e2ec439`](https://github.com/crs48/xNet/commit/e2ec43932ec3b05e74765a537ae9b94a219c7c36), [`735d491`](https://github.com/crs48/xNet/commit/735d491217a964c5210140ac58925db0ecdd765e), [`d246195`](https://github.com/crs48/xNet/commit/d2461957723cc4c9e6366192670127f8bd1d458d), [`3ea44c6`](https://github.com/crs48/xNet/commit/3ea44c6354e3f55443d3c3b49d8ca1f9c0941987)]:
  - @xnetjs/data@2.3.0
  - @xnetjs/identity@2.3.0
  - @xnetjs/plugins@2.3.0
  - @xnetjs/runtime@0.5.3
  - @xnetjs/sync@2.3.0
  - @xnetjs/sqlite@2.3.0
  - @xnetjs/crypto@2.3.0
  - @xnetjs/core@2.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`2962c28`](https://github.com/crs48/xNet/commit/2962c28afd0b5c15ce42ee1b42e58e6c55868d5a)]:
  - @xnetjs/data@2.2.0
  - @xnetjs/plugins@2.2.0
  - @xnetjs/runtime@0.5.2
  - @xnetjs/sqlite@2.2.0
  - @xnetjs/sync@2.2.0
  - @xnetjs/identity@2.2.0
  - @xnetjs/crypto@2.2.0
  - @xnetjs/core@2.2.0

## 0.2.0

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

### Patch Changes

- Updated dependencies [[`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708), [`fa93e2f`](https://github.com/crs48/xNet/commit/fa93e2f7177367e7336f6a825f8c3436a2165833)]:
  - @xnetjs/data@2.1.0
  - @xnetjs/identity@2.1.0
  - @xnetjs/plugins@2.1.0
  - @xnetjs/runtime@0.5.1
  - @xnetjs/sync@2.1.0
  - @xnetjs/sqlite@2.1.0
  - @xnetjs/crypto@2.1.0
  - @xnetjs/core@2.1.0

## 0.1.7

### Patch Changes

- Updated dependencies [[`6a5a15e`](https://github.com/crs48/xNet/commit/6a5a15e5d7693f54a0c859b1f096dc6405694574), [`2a7b80f`](https://github.com/crs48/xNet/commit/2a7b80f613d1c7b5db637639d4a3176df23ae1f3), [`85c9700`](https://github.com/crs48/xNet/commit/85c9700d6de11459f39083a1824f9cbf79cdb7bd), [`a91f278`](https://github.com/crs48/xNet/commit/a91f278ac122c588145ebb5f3981f6745b30ba66), [`dd956e5`](https://github.com/crs48/xNet/commit/dd956e512b60f3b4288ae4fb0cb2ade875da1f9f), [`e4cb876`](https://github.com/crs48/xNet/commit/e4cb876cc49fcf94a71d015dd60683ff038b367c), [`e2e78cd`](https://github.com/crs48/xNet/commit/e2e78cd319723972591e1aae9d87af4588edfda3), [`0f7ef43`](https://github.com/crs48/xNet/commit/0f7ef435afab91022433ae6c60c3a71510a1d036)]:
  - @xnetjs/plugins@2.0.0
  - @xnetjs/data@2.0.0
  - @xnetjs/runtime@0.5.0
  - @xnetjs/sqlite@2.0.0
  - @xnetjs/sync@2.0.0
  - @xnetjs/identity@2.0.0
  - @xnetjs/crypto@2.0.0
  - @xnetjs/core@2.0.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174), [`3bc1b5f`](https://github.com/crs48/xNet/commit/3bc1b5f1243cba019c60c0fda062953fa3ffb910), [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c), [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28)]:
  - @xnetjs/core@1.0.0
  - @xnetjs/sync@1.0.0
  - @xnetjs/data@1.0.0
  - @xnetjs/sqlite@1.0.0
  - @xnetjs/plugins@1.0.0
  - @xnetjs/runtime@0.4.0
  - @xnetjs/crypto@1.0.0
  - @xnetjs/identity@1.0.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141)]:
  - @xnetjs/core@0.12.0
  - @xnetjs/runtime@0.3.2
  - @xnetjs/plugins@0.12.0
  - @xnetjs/data@0.12.0
  - @xnetjs/crypto@0.12.0
  - @xnetjs/identity@0.12.0
  - @xnetjs/sync@0.12.0
  - @xnetjs/sqlite@0.12.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`f4ee6f9`](https://github.com/crs48/xNet/commit/f4ee6f96345f8d221100c820732e19566d7118f1)]:
  - @xnetjs/runtime@0.3.1
  - @xnetjs/plugins@0.11.1
  - @xnetjs/data@0.11.1
  - @xnetjs/sqlite@0.11.1
  - @xnetjs/sync@0.11.1
  - @xnetjs/identity@0.11.1
  - @xnetjs/crypto@0.11.1
  - @xnetjs/core@0.11.1

## 0.1.3

### Patch Changes

- Updated dependencies [[`07b480d`](https://github.com/crs48/xNet/commit/07b480d14d34ba7b6d74a49233fc9842f1facfde), [`d9cd478`](https://github.com/crs48/xNet/commit/d9cd478e554e3bb5de6f6c58c3d1550143bdd31a), [`e68c016`](https://github.com/crs48/xNet/commit/e68c01661c77077489f72b97d5f90e0990aa18e1)]:
  - @xnetjs/runtime@0.3.0
  - @xnetjs/data@0.11.0
  - @xnetjs/plugins@0.11.0
  - @xnetjs/sqlite@0.11.0
  - @xnetjs/sync@0.11.0
  - @xnetjs/identity@0.11.0
  - @xnetjs/crypto@0.11.0
  - @xnetjs/core@0.11.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7)]:
  - @xnetjs/data@0.10.0
  - @xnetjs/plugins@0.10.0
  - @xnetjs/runtime@0.2.2
  - @xnetjs/sqlite@0.10.0
  - @xnetjs/sync@0.10.0
  - @xnetjs/identity@0.10.0
  - @xnetjs/crypto@0.10.0
  - @xnetjs/core@0.10.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25), [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852)]:
  - @xnetjs/sync@0.9.0
  - @xnetjs/data@0.9.0
  - @xnetjs/runtime@0.2.1
  - @xnetjs/plugins@0.9.0
  - @xnetjs/sqlite@0.9.0
  - @xnetjs/identity@0.9.0
  - @xnetjs/crypto@0.9.0
  - @xnetjs/core@0.9.0

## 0.1.0

### Minor Changes

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

- Updated dependencies [[`dd3b1cb`](https://github.com/crs48/xNet/commit/dd3b1cb270386b243afe0ba28e8e2a55c9ff2726), [`853d849`](https://github.com/crs48/xNet/commit/853d849039ebf7793dcc41ef3370def95e5dba14), [`10c9f87`](https://github.com/crs48/xNet/commit/10c9f87a20264bae60e2bee51eb31fb849364be7), [`677856e`](https://github.com/crs48/xNet/commit/677856e0317800a0f6e78531ae490aca744570d9)]:
  - @xnetjs/plugins@0.8.0
  - @xnetjs/runtime@0.2.0
  - @xnetjs/devkit@1.0.0
  - @xnetjs/data@0.8.0
  - @xnetjs/sqlite@0.8.0
  - @xnetjs/sync@0.8.0
  - @xnetjs/identity@0.8.0
  - @xnetjs/crypto@0.8.0
  - @xnetjs/core@0.8.0

## 0.0.12

### Patch Changes

- Updated dependencies [[`a5813fc`](https://github.com/crs48/xNet/commit/a5813fc432fcb44cad0caba72d8bfcb065bf5dec)]:
  - @xnetjs/plugins@0.7.0
  - @xnetjs/runtime@0.1.8
  - @xnetjs/data@0.7.0
  - @xnetjs/sqlite@0.7.0
  - @xnetjs/sync@0.7.0
  - @xnetjs/identity@0.7.0
  - @xnetjs/crypto@0.7.0
  - @xnetjs/core@0.7.0

## 0.0.11

### Patch Changes

- Updated dependencies [[`6795f6b`](https://github.com/crs48/xNet/commit/6795f6b0e89c225cfa7892119ab63d6a04226b8f), [`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025)]:
  - @xnetjs/plugins@0.6.0
  - @xnetjs/data@0.6.0
  - @xnetjs/runtime@0.1.7
  - @xnetjs/sqlite@0.6.0
  - @xnetjs/sync@0.6.0
  - @xnetjs/identity@0.6.0
  - @xnetjs/crypto@0.6.0
  - @xnetjs/core@0.6.0

## 0.0.10

### Patch Changes

- Updated dependencies [[`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c)]:
  - @xnetjs/data@0.5.0
  - @xnetjs/plugins@0.5.0
  - @xnetjs/runtime@0.1.6
  - @xnetjs/sqlite@0.5.0
  - @xnetjs/sync@0.5.0
  - @xnetjs/identity@0.5.0
  - @xnetjs/crypto@0.5.0
  - @xnetjs/core@0.5.0

## 0.0.9

### Patch Changes

- Updated dependencies [[`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204)]:
  - @xnetjs/data@0.4.0
  - @xnetjs/plugins@0.4.0
  - @xnetjs/runtime@0.1.5
  - @xnetjs/sqlite@0.4.0
  - @xnetjs/sync@0.4.0
  - @xnetjs/identity@0.4.0
  - @xnetjs/crypto@0.4.0
  - @xnetjs/core@0.4.0

## 0.0.8

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/data@0.3.0
  - @xnetjs/plugins@0.3.0
  - @xnetjs/crypto@0.3.0
  - @xnetjs/identity@0.3.0
  - @xnetjs/runtime@0.1.4
  - @xnetjs/sync@0.3.0
  - @xnetjs/sqlite@0.3.0

## 0.0.7

### Patch Changes

- Updated dependencies [[`7928202`](https://github.com/crs48/xNet/commit/792820204f71b8943f9e601f5edb3a68f86e48f5)]:
  - @xnetjs/plugins@0.2.0
  - @xnetjs/runtime@0.1.3
  - @xnetjs/data@0.2.0
  - @xnetjs/sqlite@0.2.0
  - @xnetjs/sync@0.2.0
  - @xnetjs/identity@0.2.0
  - @xnetjs/crypto@0.2.0
  - @xnetjs/core@0.2.0

## 0.0.6

### Patch Changes

- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc), [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/data@0.1.2
  - @xnetjs/sqlite@0.1.2
  - @xnetjs/plugins@0.1.2
  - @xnetjs/runtime@0.1.2
  - @xnetjs/sync@0.1.2
  - @xnetjs/identity@0.1.2
  - @xnetjs/crypto@0.1.2
  - @xnetjs/core@0.1.2

## 0.0.5

### Patch Changes

- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/sqlite@0.1.1
  - @xnetjs/data@0.1.1
  - @xnetjs/plugins@0.1.1
  - @xnetjs/runtime@0.1.1
  - @xnetjs/sync@0.1.1
  - @xnetjs/identity@0.1.1
  - @xnetjs/crypto@0.1.1
  - @xnetjs/core@0.1.1

## 0.0.4

### Patch Changes

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`acbf801`](https://github.com/crs48/xNet/commit/acbf801aeec7f958bd953a9f3d98cc355a0387db), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`985ac8f`](https://github.com/crs48/xNet/commit/985ac8f73ce3539e561cc03ab0c5d3b2a61d6029), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`d4bfe27`](https://github.com/crs48/xNet/commit/d4bfe2775d80d28afec11799edd911b9529c8bfe), [`0f7e114`](https://github.com/crs48/xNet/commit/0f7e114c1471688f083c371ee39072eaf3596a19), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`1a44c5d`](https://github.com/crs48/xNet/commit/1a44c5decb087cfbf44e152d811a51f953893036), [`22ab91d`](https://github.com/crs48/xNet/commit/22ab91dc3e979446a87e84fbf0a8258276c309f0), [`b320a06`](https://github.com/crs48/xNet/commit/b320a062c1d4485e2756fae87cad5a016d4eb5ed), [`2a638ec`](https://github.com/crs48/xNet/commit/2a638ec81145eb89f156ca5275227412680df898), [`7e6f5b7`](https://github.com/crs48/xNet/commit/7e6f5b73b6dfad38d645d0be25cd11670211e999), [`9e19545`](https://github.com/crs48/xNet/commit/9e19545318b1d48df7f6ef1b8bd7b472f12f1747), [`cae9734`](https://github.com/crs48/xNet/commit/cae973482bd336de1ad0be8e557e706f01e1462e), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`3261a75`](https://github.com/crs48/xNet/commit/3261a7500df87f5c24baba2d0f6f389f7ff8ebf7), [`3c8a6a6`](https://github.com/crs48/xNet/commit/3c8a6a61c56eadc8f0b8657ce8a241981f7e7dc4), [`237a67c`](https://github.com/crs48/xNet/commit/237a67c0f2d583fca11795b76f83e75718285ee5), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`b0cd77c`](https://github.com/crs48/xNet/commit/b0cd77c2612f1a6540ead9e4edb9916b6d09cb66), [`142b1c0`](https://github.com/crs48/xNet/commit/142b1c05d80f5f7fe46ed80cd5bafc0fe9c14630), [`0e0802d`](https://github.com/crs48/xNet/commit/0e0802dc22a64703ca54168a4a731cd1d34a54bf), [`839b2b7`](https://github.com/crs48/xNet/commit/839b2b73373ea774438fbf624690eae3d368ceab), [`d9008d2`](https://github.com/crs48/xNet/commit/d9008d2f2332129b367746ae7991be144fb7d8e1), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/plugins@0.1.0
  - @xnetjs/sqlite@0.1.0
  - @xnetjs/runtime@0.1.0
  - @xnetjs/identity@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/sync@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`6183829`](https://github.com/crs48/xNet/commit/618382920002a39f00e4f5f4a2ae604c2aef4fa6)]:
  - @xnetjs/devkit@0.0.2
  - @xnetjs/plugins@0.0.3
  - @xnetjs/runtime@0.0.2
  - @xnetjs/data@0.0.3
  - @xnetjs/sqlite@0.0.3
  - @xnetjs/sync@0.0.3
  - @xnetjs/identity@0.0.3
  - @xnetjs/crypto@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/data@0.0.2
  - @xnetjs/sync@0.0.2
