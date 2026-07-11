# @xnetjs/react

## 0.11.0

### Minor Changes

- [#467](https://github.com/crs48/xNet/pull/467) [`07b480d`](https://github.com/crs48/xNet/commit/07b480d14d34ba7b6d74a49233fc9842f1facfde) Thanks [@crs48](https://github.com/crs48)! - Deliver a shared chat channel's nodes to a grantee (exploration 0298). `NodeStoreSyncProvider` gains a subscribe-only mode (receives + applies a room but never publishes local changes and never advances its cursor from a live broadcast — share rooms cursor on a per-room `seq`). `SyncManager` gains `subscribeShareRoom(room)` / `unsubscribeShareRoom(room)`, and a `channelShareRoom(id)` helper is exported (re-exported from `@xnetjs/react`). Together these let a client subscribe to a channel's `xnet-channel-<id>` share room so its node, message history, and members' profiles sync in — the transport that channel share links were missing.

- [#470](https://github.com/crs48/xNet/pull/470) [`e68c016`](https://github.com/crs48/xNet/commit/e68c01661c77077489f72b97d5f90e0990aa18e1) Thanks [@crs48](https://github.com/crs48)! - Add `workspaceShareRoom(id)` (re-exported from `@xnetjs/react`) so a shared workspace (bench) node is delivered to a grantee via the same share-room mechanism as channels (exploration 0298 Phase 2).

### Patch Changes

- Updated dependencies [[`07b480d`](https://github.com/crs48/xNet/commit/07b480d14d34ba7b6d74a49233fc9842f1facfde), [`d9cd478`](https://github.com/crs48/xNet/commit/d9cd478e554e3bb5de6f6c58c3d1550143bdd31a), [`e68c016`](https://github.com/crs48/xNet/commit/e68c01661c77077489f72b97d5f90e0990aa18e1)]:
  - @xnetjs/runtime@0.3.0
  - @xnetjs/data@0.11.0
  - @xnetjs/data-bridge@0.11.0
  - @xnetjs/history@0.11.0
  - @xnetjs/plugins@0.11.0
  - @xnetjs/sync@0.11.0
  - @xnetjs/identity@0.11.0
  - @xnetjs/crypto@0.11.0
  - @xnetjs/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7)]:
  - @xnetjs/data@0.10.0
  - @xnetjs/data-bridge@0.10.0
  - @xnetjs/history@0.10.0
  - @xnetjs/plugins@0.10.0
  - @xnetjs/runtime@0.2.2
  - @xnetjs/sync@0.10.0
  - @xnetjs/identity@0.10.0
  - @xnetjs/crypto@0.10.0
  - @xnetjs/core@0.10.0

## 0.9.0

### Patch Changes

- [#458](https://github.com/crs48/xNet/pull/458) [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852) Thanks [@crs48](https://github.com/crs48)! - Checklist→task reconciliation (`usePageTaskSync` / `useCanvasTaskSync`) no
  longer runs before the editor publishes its first snapshot for the current
  host — a mount race could archive every hosted task and a reused surface
  could reconcile the previous page's snapshot after navigation. The
  `'Untitled task'` extraction fallback emitted transiently by delete
  gestures can no longer overwrite a task's real title, in diff updates or
  cross-page claims.
- Updated dependencies [[`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25), [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852)]:
  - @xnetjs/sync@0.9.0
  - @xnetjs/data@0.9.0
  - @xnetjs/data-bridge@0.9.0
  - @xnetjs/history@0.9.0
  - @xnetjs/runtime@0.2.1
  - @xnetjs/plugins@0.9.0
  - @xnetjs/identity@0.9.0
  - @xnetjs/crypto@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [[`dd3b1cb`](https://github.com/crs48/xNet/commit/dd3b1cb270386b243afe0ba28e8e2a55c9ff2726), [`853d849`](https://github.com/crs48/xNet/commit/853d849039ebf7793dcc41ef3370def95e5dba14), [`677856e`](https://github.com/crs48/xNet/commit/677856e0317800a0f6e78531ae490aca744570d9)]:
  - @xnetjs/plugins@0.8.0
  - @xnetjs/runtime@0.2.0
  - @xnetjs/history@0.8.0
  - @xnetjs/data-bridge@0.8.0
  - @xnetjs/data@0.8.0
  - @xnetjs/sync@0.8.0
  - @xnetjs/identity@0.8.0
  - @xnetjs/crypto@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`a5813fc`](https://github.com/crs48/xNet/commit/a5813fc432fcb44cad0caba72d8bfcb065bf5dec)]:
  - @xnetjs/plugins@0.7.0
  - @xnetjs/runtime@0.1.8
  - @xnetjs/history@0.7.0
  - @xnetjs/data-bridge@0.7.0
  - @xnetjs/data@0.7.0
  - @xnetjs/sync@0.7.0
  - @xnetjs/identity@0.7.0
  - @xnetjs/crypto@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`6795f6b`](https://github.com/crs48/xNet/commit/6795f6b0e89c225cfa7892119ab63d6a04226b8f), [`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025)]:
  - @xnetjs/plugins@0.6.0
  - @xnetjs/data@0.6.0
  - @xnetjs/runtime@0.1.7
  - @xnetjs/data-bridge@0.6.0
  - @xnetjs/history@0.6.0
  - @xnetjs/sync@0.6.0
  - @xnetjs/identity@0.6.0
  - @xnetjs/crypto@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c)]:
  - @xnetjs/data@0.5.0
  - @xnetjs/plugins@0.5.0
  - @xnetjs/data-bridge@0.5.0
  - @xnetjs/history@0.5.0
  - @xnetjs/runtime@0.1.6
  - @xnetjs/sync@0.5.0
  - @xnetjs/identity@0.5.0
  - @xnetjs/crypto@0.5.0
  - @xnetjs/core@0.5.0

## 0.4.0

### Minor Changes

- [#405](https://github.com/crs48/xNet/pull/405) [`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204) Thanks [@crs48](https://github.com/crs48)! - Add the form view foundation (exploration 0278). `@xnetjs/data` gains a
  `'form'` DatabaseView type with `formConfig`/`formRules`/`formAccepting`
  properties, a `submissionMeta` provenance property on DatabaseRow, and a
  UI-free form core (`FormViewConfig`, `FormFieldRule`, `visibleFormQuestions`,
  `validateFormSubmission`, `isFormFieldTypeAllowed`,
  `PUBLIC_SAFE_FORM_FIELD_TYPES`) whose show-if rules evaluate through the
  existing filter engine. `@xnetjs/react`'s `useGridDatabase` exposes the form
  view model plus `setFormConfig`/`setFormRules`/`setFormAccepting`, and
  `addRow` accepts `AddRowOptions` (`id` for deterministic/idempotent row ids,
  `meta` for submission provenance).

  For public forms, `@xnetjs/data` also gains `buildPublicFormDefinition`
  (the sanitized snapshot the hub serves to anonymous respondents),
  `submissionRowId` (deterministic drain-time row ids from the submission
  nonce), and `createRow` now accepts `id`/`submissionMeta`.

### Patch Changes

- Updated dependencies [[`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204)]:
  - @xnetjs/data@0.4.0
  - @xnetjs/data-bridge@0.4.0
  - @xnetjs/history@0.4.0
  - @xnetjs/plugins@0.4.0
  - @xnetjs/runtime@0.1.5
  - @xnetjs/sync@0.4.0
  - @xnetjs/identity@0.4.0
  - @xnetjs/crypto@0.4.0
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
  - @xnetjs/plugins@0.3.0
  - @xnetjs/crypto@0.3.0
  - @xnetjs/data-bridge@0.3.0
  - @xnetjs/history@0.3.0
  - @xnetjs/identity@0.3.0
  - @xnetjs/runtime@0.1.4
  - @xnetjs/sync@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`7928202`](https://github.com/crs48/xNet/commit/792820204f71b8943f9e601f5edb3a68f86e48f5)]:
  - @xnetjs/plugins@0.2.0
  - @xnetjs/runtime@0.1.3
  - @xnetjs/history@0.2.0
  - @xnetjs/data-bridge@0.2.0
  - @xnetjs/data@0.2.0
  - @xnetjs/sync@0.2.0
  - @xnetjs/identity@0.2.0
  - @xnetjs/crypto@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc), [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/data@0.1.2
  - @xnetjs/data-bridge@0.1.2
  - @xnetjs/history@0.1.2
  - @xnetjs/plugins@0.1.2
  - @xnetjs/runtime@0.1.2
  - @xnetjs/sync@0.1.2
  - @xnetjs/identity@0.1.2
  - @xnetjs/crypto@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/data@0.1.1
  - @xnetjs/data-bridge@0.1.1
  - @xnetjs/history@0.1.1
  - @xnetjs/plugins@0.1.1
  - @xnetjs/runtime@0.1.1
  - @xnetjs/sync@0.1.1
  - @xnetjs/identity@0.1.1
  - @xnetjs/crypto@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Minor Changes

- [#341](https://github.com/crs48/xNet/pull/341) [`1306265`](https://github.com/crs48/xNet/commit/1306265a33ca1028683eecd9932a1cdc999132a4) Thanks [@crs48](https://github.com/crs48)! - Make guardian (social) recovery configurable and threshold-aware (exploration 0243).
  Settings lets you choose how many guardians (2–7) and how many are needed; the onboarding
  recovery screen now reads the required threshold from the pasted share codes and only
  enables recovery once you have enough (rather than assuming 2-of-3), flagging unrecognized
  codes as you paste.

- [#339](https://github.com/crs48/xNet/pull/339) [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544) Thanks [@crs48](https://github.com/crs48)! - Wire social recovery ("trusted guardians") into the UI (exploration 0243) — xNet's
  Apple-recovery-contacts analogue. Settings → Account can split a recoverable identity
  into 3 guardian share codes (any 2 recover it), and onboarding gains a "Recover with
  guardian shares" path that reconstructs the identity from enough codes on a new device.
  `@xnetjs/identity` adds `serializeShare` / `parseShare` for the copy-pasteable
  `xnet-share:…` codes. Recovery is entirely user-to-user; the cloud is never involved.

- [#324](https://github.com/crs48/xNet/pull/324) [`a155c43`](https://github.com/crs48/xNet/commit/a155c433ad34e5d10380c479cd283feea9423249) Thanks [@crs48](https://github.com/crs48)! - Wire opt-in recovery phrases into onboarding (exploration 0243, Phase 1). The welcome
  screen gains a "Set up a recovery phrase too" option that mints a recoverable identity
  and shows the phrase once to save; the "Enter recovery phrase" path now validates the
  phrase against the wordlist and recovers the same identity on a new device (enrolling a
  local passkey to gate it). New machine states `creating-recoverable` /
  `show-recovery-phrase` and events `CREATE_RECOVERABLE` / `SUBMIT_PHRASE` /
  `RECOVERABLE_CREATED` / `PHRASE_SAVED` / `IMPORT_FAILED`.

- [#333](https://github.com/crs48/xNet/pull/333) [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c) Thanks [@crs48](https://github.com/crs48)! - Surface synced-passkey recovery in onboarding (exploration 0243, P1.4). The
  `IdentityManager` gains `recoverViaSyncedPasskey()`, which discovers an xNet passkey
  synced from another device (iCloud Keychain / Google Password Manager), unlocks it
  (same PRF → same DID), and stores it locally — returning null when none is available so
  the caller can fall back to the recovery phrase. The import screen now leads with a
  "Use a synced passkey" option (new `USE_SYNCED_PASSKEY` onboarding event), giving
  same-ecosystem users a phrase-free return path.

### Patch Changes

- [#384](https://github.com/crs48/xNet/pull/384) [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2) Thanks [@crs48](https://github.com/crs48)! - Query-model read-speed upgrades (exploration 0264).

  **@xnetjs/data** — hydration now aggregates in SQL (`json_group_object`,
  one row per node instead of one per node×property; default ON,
  `aggregatedHydration: false` opts out) — benchmarked on the real WASM build
  at 8× fewer boundary rows, 4.9× faster hydrate SQL, and 4.5× faster
  end-to-end; pushed-down queries fuse the candidate select and hydrate into
  ONE statement (with `COUNT(*) OVER ()` folding `count: 'exact'` in);
  id-list SQL pads to fixed arity buckets so the worker's prepared-statement
  cache actually hits; adaptive indexing can defer index creation to an idle
  `scheduleMaintenance` hook; and with adaptive indexing enabled, a single
  custom-property sort now pushes down to SQL pagination (one page hydrated
  instead of the whole schema).

  **@xnetjs/data-bridge** — new warm-start snapshot seam on the main-thread
  bridge: `exportQuerySnapshots()` / `seedQuerySnapshots()` persist and
  re-seed loaded query results as stale entries that render instantly while
  the live query revalidates.

  **@xnetjs/sqlite** — query-planner statistics hygiene: `analysis_limit` +
  `PRAGMA optimize=0x10002` at open (web and electron), enabling skip-scan
  and informed index choice on long-lived connections.

  **@xnetjs/react** — exports `useDataBridge`.

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

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`acbf801`](https://github.com/crs48/xNet/commit/acbf801aeec7f958bd953a9f3d98cc355a0387db), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`985ac8f`](https://github.com/crs48/xNet/commit/985ac8f73ce3539e561cc03ab0c5d3b2a61d6029), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`0f7e114`](https://github.com/crs48/xNet/commit/0f7e114c1471688f083c371ee39072eaf3596a19), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`1a44c5d`](https://github.com/crs48/xNet/commit/1a44c5decb087cfbf44e152d811a51f953893036), [`2a638ec`](https://github.com/crs48/xNet/commit/2a638ec81145eb89f156ca5275227412680df898), [`9e19545`](https://github.com/crs48/xNet/commit/9e19545318b1d48df7f6ef1b8bd7b472f12f1747), [`cae9734`](https://github.com/crs48/xNet/commit/cae973482bd336de1ad0be8e557e706f01e1462e), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`3c8a6a6`](https://github.com/crs48/xNet/commit/3c8a6a61c56eadc8f0b8657ce8a241981f7e7dc4), [`237a67c`](https://github.com/crs48/xNet/commit/237a67c0f2d583fca11795b76f83e75718285ee5), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/plugins@0.1.0
  - @xnetjs/runtime@0.1.0
  - @xnetjs/identity@0.1.0
  - @xnetjs/data-bridge@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/history@0.1.0
  - @xnetjs/sync@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`6183829`](https://github.com/crs48/xNet/commit/618382920002a39f00e4f5f4a2ae604c2aef4fa6)]:
  - @xnetjs/billing@0.0.2
  - @xnetjs/plugins@0.0.3
  - @xnetjs/runtime@0.0.2
  - @xnetjs/history@0.0.3
  - @xnetjs/data-bridge@0.0.3
  - @xnetjs/data@0.0.3
  - @xnetjs/sync@0.0.3
  - @xnetjs/identity@0.0.3
  - @xnetjs/crypto@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/data-bridge@0.0.2
  - @xnetjs/identity@0.0.2
  - @xnetjs/history@0.0.2
  - @xnetjs/plugins@0.0.2
  - @xnetjs/crypto@0.0.2
  - @xnetjs/core@0.0.2
  - @xnetjs/data@0.0.2
