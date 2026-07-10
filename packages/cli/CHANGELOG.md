# @xnetjs/cli

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
