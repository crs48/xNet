# @xnetjs/data

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

### Patch Changes

- Updated dependencies [[`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708)]:
  - @xnetjs/identity@2.1.0
  - @xnetjs/sync@2.1.0
  - @xnetjs/storage@2.1.0
  - @xnetjs/sqlite@2.1.0
  - @xnetjs/crypto@2.1.0
  - @xnetjs/core@2.1.0

## 2.0.0

### Minor Changes

- [#496](https://github.com/crs48/xNet/pull/496) [`85c9700`](https://github.com/crs48/xNet/commit/85c9700d6de11459f39083a1824f9cbf79cdb7bd) Thanks [@crs48](https://github.com/crs48)! - Yjs fragment readers understand the BlockNote document schema (exploration 0312).

  Documents now live in the `content-v4` fragment using BlockNote's ProseMirror
  shape (`blockGroup > blockContainer > blockContent`); the legacy TipTap
  `content` fragment remains readable as a fallback until each doc is lazily
  imported.
  - `@xnetjs/data`: `getRichTextPlainText` extracts text from BlockNote-shaped
    rich-text cells, including the new inline atoms (`mention` → `@label`,
    `hashtag` → `#name`, `wikilink` → title, `inlineMath` → latex), while still
    reading legacy TipTap-shaped cells.
  - `@xnetjs/history`: version-diff text extraction prefers `content-v4` (legacy
    `content` fallback) and renders BlockNote inline atoms as readable text.
  - `@xnetjs/react`: new `useMergedEditorContributions` /
    `mergeEditorContributions` (+ `MergedEditorContributions` type) collect
    plugin-contributed BlockNote `blockSpecs`/`inlineContentSpecs`/`styleSpecs`
    and slash menu items from the plugin registry, running the editor
    schema-skew guard (`warnOnEditorSchemaRisks`) against the host's statically
    bundled spec names and excluding un-bundled (skew-hazard) specs.
  - `@xnetjs/runtime`: blob-CID retention scanning now also walks the
    `content-v4` and `content` fragments, so blobs referenced from page
    documents are discovered.

- [#523](https://github.com/crs48/xNet/pull/523) [`a91f278`](https://github.com/crs48/xNet/commit/a91f278ac122c588145ebb5f3981f6745b30ba66) Thanks [@crs48](https://github.com/crs48)! - Drafts P2/P3 (exploration 0329): Patchwork-style branching on the change log.
  - `@xnetjs/data`: `Draft` node schema (`DRAFT_SCHEMA_IRI`, entries map, no
    nesting); `NodeStore` draft overlay — `setCheckedOutDraft` swaps member
    reads to clone content under original ids, redirects member writes to
    clones with lazy copy-on-write, mirrors clone change events to original-id
    subscribers, and exposes `getRaw` for overlay-free reads; device-local
    draft privacy set (`markDraftPrivate`/`isDraftPrivate`).
  - `@xnetjs/history`: draft lifecycle (`createDraft`, `forkNodeIntoDraft` —
    signed snapshot-create + pinned fork point + Yjs blob fork with state
    vector, `discardDraft`, `listDrafts`, never-fork policy); merge
    (`threeWayPropertyMerge`, `mergeDraft` — one merger-signed squash batch
    with draft-born promotion via temp ids, relation remapping, deletion
    conflict cards, idempotent Yjs delta lane, provenance) and
    `refreshDraftFromMain` (floating drafts).
  - `@xnetjs/runtime`: `NodeStoreSyncProvider` gains a `shouldPublish`
    predicate; the personal node-sync room excludes draft-private nodes, and
    draft privacy is rehydrated before sync starts.

- [#523](https://github.com/crs48/xNet/pull/523) [`dd956e5`](https://github.com/crs48/xNet/commit/dd956e512b60f3b4288ae4fb0cb2ade875da1f9f) Thanks [@crs48](https://github.com/crs48)! - Drafts UI plumbing (exploration 0329 P2/P3).
  - `@xnetjs/react`: new `useDraft(hostId)` hook (hooks sub-barrel) binding the
    draft engine and the NodeStore checkout overlay — list/create open drafts
    for a host, `checkout` (content-swap reads + lazy copy-on-write via
    `onMissingMember` → `forkNodeIntoDraft`), `returnToMain`, `discard`
    (leaves the checkout first), `merge` (merger-signed squash; returns
    conflict cards), `refresh` (fold main into the draft; pauses on
    conflicts), `setReviewRequested`, and `computeReview` — per-property
    three-way review cards (base at fork vs main now vs draft now) plus Yjs
    document-differs indicators, computed without applying anything. Database
    hosts widen the member scope to their row nodes. Re-exports
    `DraftMergeConflict`, `MergeDraftResult`, `RefreshDraftResult` for
    consumers.
  - `@xnetjs/data`: the `Draft` schema gains an optional `reviewRequested`
    checkbox (default `false`) — the P4 request-surfacing flag the
    Inbox/Requests surface lists open drafts by.

- [#499](https://github.com/crs48/xNet/pull/499) [`e4cb876`](https://github.com/crs48/xNet/commit/e4cb876cc49fcf94a71d015dd60683ff038b367c) Thanks [@crs48](https://github.com/crs48)! - Add the `DebugReport` schema (`DebugReportSchema`, `type DebugReport`) for
  first-party crash/debug-report triage nodes (exploration 0315). Reports carry
  code-level diagnostics only, group by fingerprint, and inherit access from their
  diagnostics Space via the standard space cascade.

- [#523](https://github.com/crs48/xNet/pull/523) [`0f7ef43`](https://github.com/crs48/xNet/commit/0f7ef435afab91022433ae6c60c3a71510a1d036) Thanks [@crs48](https://github.com/crs48)! - Time Machine P1 (exploration 0329): frontiers, checkpoints, pins, prune horizon, scope timelines, production Yjs snapshot capture, and a React scrub hook.
  - `@xnetjs/history`: new `Frontier` primitive (hash-anchored per-node positions:
    `captureFrontier`, `frontierAtWallTime`, `frontierTarget`,
    `materializeAtFrontier`, Yjs snapshot refs + pin keys); named checkpoints
    (`createCheckpoint`, `listCheckpoints`, `deleteCheckpoint`, `pinFrontier`,
    `restoreToFrontier`); `ScopeTimeline`/`ScopeScrubCache` generalizing
    `SchemaTimeline` to arbitrary node sets; `HistoryHorizonError` +
    `HistoryEngine.getHorizon` — targets below the prune horizon now fail loudly
    instead of silently remapping to the wrong change.
  - `@xnetjs/data`: `Checkpoint` node schema (`CHECKPOINT_SCHEMA_IRI`); pin
    registry on storage adapters (`NodeStorageAdapter.pins`, `PinEntry`,
    `PinRegistry`) protecting pinned changes and Yjs snapshots from pruning and
    eviction (memory + SQLite implementations).
  - `@xnetjs/sqlite`: `pinned_changes` table (additive migration).
  - `@xnetjs/runtime`: Yjs history snapshots are now captured on production doc
    persists (throttled session-boundary/min-interval capture in NodePool).
  - `@xnetjs/react`: new `useTimeMachine` hook (hooks sub-barrel) binding a
    scrubber UI to the merged scope timeline: position/step navigation, preview +
    property diff at the scrub position, named versions, one-transaction restore,
    and history-horizon reporting.

### Patch Changes

- [#498](https://github.com/crs48/xNet/pull/498) [`e2e78cd`](https://github.com/crs48/xNet/commit/e2e78cd319723972591e1aae9d87af4588edfda3) Thanks [@crs48](https://github.com/crs48)! - Fix "no such column: p.tiebreak_key" on databases created before schema v8. The
  `tiebreak_key` column repair now runs before the first `node_properties` read
  (`getNode`/`getNodes`/`listNodes`/`queryNodes`), not just before writes — a
  fresh session that opened a document page hit the missing column on its first
  hydrate query before any write could trigger the lazy guard. Also adds the
  missing v8 entry to `SCHEMA_MIGRATIONS` (`ALTER TABLE node_properties ADD
COLUMN tiebreak_key TEXT`).
- Updated dependencies [[`e2e78cd`](https://github.com/crs48/xNet/commit/e2e78cd319723972591e1aae9d87af4588edfda3), [`0f7ef43`](https://github.com/crs48/xNet/commit/0f7ef435afab91022433ae6c60c3a71510a1d036)]:
  - @xnetjs/sqlite@2.0.0
  - @xnetjs/storage@2.0.0
  - @xnetjs/sync@2.0.0
  - @xnetjs/identity@2.0.0
  - @xnetjs/crypto@2.0.0
  - @xnetjs/core@2.0.0

## 1.0.0

### Major Changes

- [#482](https://github.com/crs48/xNet/pull/482) [`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174) Thanks [@crs48](https://github.com/crs48)! - Grinding-resistant Last-Write-Wins tiebreak (protocol v4, exploration 0305)

  The final LWW conflict tiebreak was the raw author DID ("higher DID wins").
  Because a `did:key` is a free, attacker-chosen function of a keypair, an
  attacker could grind a vanity DID that sorts highest and win **every**
  concurrent-write tie against every honest peer, permanently.

  Protocol v4 replaces that final rung with a per-conflict key,
  `blake3(authorDID ‖ property ‖ value)` (`computeLwwTiebreakKey` in
  `@xnetjs/core`), so the winner of a tie is a random-oracle function of _what is
  written_ — a ground identity wins no durable, universal advantage. The key is
  gated on both changes being v4 (legacy changes fall back to the author DID), is
  derived at resolution time (never part of the change hash or wire format), and
  is threaded through `PropertyTimestamp`, the SQLite `node_properties` guard (new
  nullable `tiebreak_key` column, schema v8), and every conformance kernel.

  BREAKING: `CURRENT_PROTOCOL_VERSION` is now `4` and new changes are stamped v4.
  The LWW golden vectors gain `0005-tie-grinding-resistant-key`; `LwwStamp` /
  `PropertyTimestamp` gain an optional `tiebreakKey`. Mixed fleets converge on
  exact `{lamport, wallTime}` ties only once both peers are on v4 — a transient
  rollout window affecting rare exact ties.

### Minor Changes

- [#488](https://github.com/crs48/xNet/pull/488) [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28) Thanks [@crs48](https://github.com/crs48)! - Schema authorization gains `create` and `update` actions — optional refinements of `write` (exploration 0304). A schema may now split its mutation policy into who may **add** nodes vs. who may **modify** existing ones; when a refinement is absent it falls back to the schema's `write` expression, so existing schemas behave identically.
  - `@xnetjs/core`: `AUTH_ACTIONS` includes `create`/`update`; new `actionExpressionOrder()` and `grantActionSatisfies()` helpers (a `write` grant covers both refinements; granular grants cover only themselves).
  - `@xnetjs/data`: the policy evaluator resolves actions with the fallback and evaluates `create` against the draft node built from the payload (container relations resolve membership, so creation into a shared Space is genuinely gated); `NodeStore` checks the precise verbs, and remote creates are inferred and checked as `create` instead of failing closed on a not-yet-existing node. New `spaceContributorAuthorization()` cascade — adopted by `ChatMessage` and `Comment` — expresses "members may post, only the author (or space admins) may edit". `StoreAuthAPI.can` accepts an optional draft `node`.
  - `@xnetjs/react`: new `useCanCreate(schemaId, properties)` hook; `useCan`/`useCanEdit` check the precise `update` verb.
  - `@xnetjs/runtime`: conformance corpus gains the `authz-actions` suite pinning the fallback table.

### Patch Changes

- Updated dependencies [[`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174), [`3bc1b5f`](https://github.com/crs48/xNet/commit/3bc1b5f1243cba019c60c0fda062953fa3ffb910), [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c), [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28)]:
  - @xnetjs/core@1.0.0
  - @xnetjs/sync@1.0.0
  - @xnetjs/sqlite@1.0.0
  - @xnetjs/crypto@1.0.0
  - @xnetjs/identity@1.0.0
  - @xnetjs/storage@1.0.0

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
  - @xnetjs/crypto@0.12.0
  - @xnetjs/identity@0.12.0
  - @xnetjs/storage@0.12.0
  - @xnetjs/sync@0.12.0
  - @xnetjs/sqlite@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.11.1
  - @xnetjs/sqlite@0.11.1
  - @xnetjs/sync@0.11.1
  - @xnetjs/identity@0.11.1
  - @xnetjs/crypto@0.11.1
  - @xnetjs/core@0.11.1

## 0.11.0

### Minor Changes

- [#465](https://github.com/crs48/xNet/pull/465) [`d9cd478`](https://github.com/crs48/xNet/commit/d9cd478e554e3bb5de6f6c58c3d1550143bdd31a) Thanks [@crs48](https://github.com/crs48)! - Profiles gain a canonical deterministic node ID and room for inline avatar images:
  - New `profileNodeId(did)` / `didFromProfileNodeId(nodeId)` helpers — a DID's canonical Profile now lives at `profile-<did>` (same pattern as `inboxStateNodeId`), so any collaborator who knows a DID (e.g. from `createdBy` on shared content) can acquire the profile without a directory lookup.
  - `Profile.avatar` max length raised from 500 to 65536 so a small, client-side-downscaled `data:image/*` avatar can live inside the Profile node itself and reach share recipients through the same sync path as the display name.

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.11.0
  - @xnetjs/sqlite@0.11.0
  - @xnetjs/sync@0.11.0
  - @xnetjs/identity@0.11.0
  - @xnetjs/crypto@0.11.0
  - @xnetjs/core@0.11.0

## 0.10.0

### Minor Changes

- [#461](https://github.com/crs48/xNet/pull/461) [`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7) Thanks [@crs48](https://github.com/crs48)! - Add composer-resolved link previews (exploration 0295): a new optional
  `linkPreviews` json field on `ChatMessageSchema` and `CommentSchema`, plus the
  `MessageLinkPreview` type with `isMessageLinkPreview`, `sanitizeLinkPreviews`,
  and `MAX_LINK_PREVIEWS_PER_MESSAGE` helpers. Previews are resolved once by the
  author's client and stored with the message — readers render the snapshot and
  never fetch the URL.

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.10.0
  - @xnetjs/sqlite@0.10.0
  - @xnetjs/sync@0.10.0
  - @xnetjs/identity@0.10.0
  - @xnetjs/crypto@0.10.0
  - @xnetjs/core@0.10.0

## 0.9.0

### Minor Changes

- [#458](https://github.com/crs48/xNet/pull/458) [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852) Thanks [@crs48](https://github.com/crs48)! - Conflict telemetry now reports only genuine divergence, and remote replays
  are idempotent end to end. `MergeConflict` gains a required `kind` field:
  `'conflict'` for a cross-author write that lost to a newer local value,
  `'lww-resolution'` for an informational lost-update where a cross-author
  write replaced a differing value. Same-author causal history, identical
  stamps, and equal values are no longer recorded at all. `applyRemoteChange`
  short-circuits changes already present in the log (new optional
  `NodeStorageAdapter.hasChange(hash)` probe, implemented by the SQLite and
  memory adapters; callers fall back to `getChangeByHash`), and the memory
  adapter dedupes appended changes by hash.

### Patch Changes

- Updated dependencies [[`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25)]:
  - @xnetjs/sync@0.9.0
  - @xnetjs/storage@0.9.0
  - @xnetjs/sqlite@0.9.0
  - @xnetjs/identity@0.9.0
  - @xnetjs/crypto@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.8.0
  - @xnetjs/sqlite@0.8.0
  - @xnetjs/sync@0.8.0
  - @xnetjs/identity@0.8.0
  - @xnetjs/crypto@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.7.0
  - @xnetjs/sqlite@0.7.0
  - @xnetjs/sync@0.7.0
  - @xnetjs/identity@0.7.0
  - @xnetjs/crypto@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Minor Changes

- [#409](https://github.com/crs48/xNet/pull/409) [`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025) Thanks [@crs48](https://github.com/crs48)! - Workspaces as nodes (exploration 0280): new `xnet:Workspace` schema in `@xnetjs/data` (name/preset/system/tree — the portable half of a saved shell layout), and workspace layout primitives in `@xnetjs/plugins` (`LayoutTree`, `createPresetTree`, `moveSlot`/`setSlotTier`, `parseWorkspacePayload`/`serializeWorkspacePayload`) shared by the web shell, the seed, and future desktop adoption.

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.6.0
  - @xnetjs/sqlite@0.6.0
  - @xnetjs/sync@0.6.0
  - @xnetjs/identity@0.6.0
  - @xnetjs/crypto@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Minor Changes

- [#407](https://github.com/crs48/xNet/pull/407) [`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c) Thanks [@crs48](https://github.com/crs48)! - Botless meeting transcription foundations (exploration 0279).

  `@xnetjs/data`: new `Meeting@1.0.0` (Yjs notes body, Page-like, private by default) and `MeetingTranscript@1.0.0` (channel-attributed timed segments, FTS full text, engine provenance, opt-in audio blob reference) schemas, plus `MeetingSegment`/`MeetingChannel`/`MeetingTemplateId` types.

  `@xnetjs/plugins`: new `systemAudio` module capability (closed by default; gates desktop system-audio capture, renders as a danger consent line) with `isSystemAudioAllowed`/`assertSystemAudio` guards, and a Google Calendar connector (`buildGoogleCalendarConnector`, `detectUpcomingMeeting`) that materializes upcoming events as Meeting nodes.

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.5.0
  - @xnetjs/sqlite@0.5.0
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

- Updated dependencies []:
  - @xnetjs/storage@0.4.0
  - @xnetjs/sqlite@0.4.0
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
  - @xnetjs/crypto@0.3.0
  - @xnetjs/identity@0.3.0
  - @xnetjs/storage@0.3.0
  - @xnetjs/sync@0.3.0
  - @xnetjs/sqlite@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.2.0
  - @xnetjs/sqlite@0.2.0
  - @xnetjs/sync@0.2.0
  - @xnetjs/identity@0.2.0
  - @xnetjs/crypto@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- [#392](https://github.com/crs48/xNet/pull/392) [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc) Thanks [@crs48](https://github.com/crs48)! - SQL property upserts now enforce the full LWW ordering triple (Lamport →
  wallTime → author code-units), matching the in-memory `shouldReplace`
  comparator. The previous lamport-only guard let arrival order decide
  same-Lamport concurrent edits, so two replicas that received the same
  conflicting changes in different orders could permanently disagree on the
  materialized value. Applies to the per-change upsert, the batched
  `applyNodeBatch` path, and the native web/electron batch adapters.

- [#392](https://github.com/crs48/xNet/pull/392) [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc) Thanks [@crs48](https://github.com/crs48)! - Changes re-read from the local SQLite change log now pass hash verification.
  The `changes` table never persisted `id`, `type`, `protocolVersion`, or the
  batch fields, yet all of them are part of the signed content hash — so the
  reload-resync push (`getChangesSince` → hub) was structurally rejected as
  INVALID_HASH, tripped the outbound circuit breaker, and stranded edits made
  offline before an app restart. New rows persist those fields in an envelope
  inside the payload BLOB (no schema migration needed); legacy rows keep the
  old fallback behaviour.
- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/sqlite@0.1.2
  - @xnetjs/storage@0.1.2
  - @xnetjs/sync@0.1.2
  - @xnetjs/identity@0.1.2
  - @xnetjs/crypto@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- [#388](https://github.com/crs48/xNet/pull/388) [`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d) Thanks [@crs48](https://github.com/crs48)! - Query-plan debug diagnostics no longer convoy the SQLite worker. With
  `xnet:query:debug` enabled, every query used to issue EXPLAIN QUERY PLAN +
  PRAGMA schema_version + one PRAGMA index_info per index as separate serial
  worker round-trips — hundreds per boot, delaying real query results by
  18-20s. `getIndexInfo` now dedupes concurrent callers onto one in-flight
  build and fetches all index metadata in a single batched
  `pragma_index_info` join (with a per-index fallback for runtimes without
  table-valued pragmas), and the storage adapter collects plan diagnostics
  once per unique compiled SQL shape per session instead of per execution
  (invalidated when adaptive indexes are created or dropped).
- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/sqlite@0.1.1
  - @xnetjs/storage@0.1.1
  - @xnetjs/sync@0.1.1
  - @xnetjs/identity@0.1.1
  - @xnetjs/crypto@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Minor Changes

- [#328](https://github.com/crs48/xNet/pull/328) [`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35) Thanks [@crs48](https://github.com/crs48)! - Add the account/device ledger schemas (explorations 0149 + 0243, Phase 2 foundation):
  `AccountRecord`, `DeviceRecord`, `RecoveryRecord`, and `RevocationRecord`. A stable
  account subject owns a set of records describing which devices may act as the account,
  which recovery methods exist, and which keys are revoked (with `status` + `epoch` for
  revocation), so the cloud billing binding can later pin to the account root instead of
  a single device DID.

  Ships with deterministic ids (`accountRecordId` / `deviceRecordId` / …) and the pure
  authorization resolution the hub will enforce — `resolveActiveDevices` and
  `isDeviceAuthorized` ("is this device currently authorized for this account?"). The
  records are authorization-exempt at the schema level because access is controller-
  signed and epoch-gated (hub-enforced), not a per-node role cascade; signing enforcement
  and the binding migration are follow-ups.

- [#329](https://github.com/crs48/xNet/pull/329) [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3) Thanks [@crs48](https://github.com/crs48)! - Add account/device ledger operations (explorations 0149 + 0243, Phase 2): pure
  builders that turn a ledger intent into the deterministic node to upsert —
  `createAccountRecord`, `admitDeviceRecord`, `revokeDeviceRecord` /
  `revokeSubjectRecord` (which bumps the account epoch), plus `accountState` to resolve
  the current epoch and the set of devices that may currently act as an account. These
  are the rules the store/hub wiring and the content-key re-wrap will call; keeping them
  pure makes device admit/revoke unit-testable on its own.

- [#277](https://github.com/crs48/xNet/pull/277) [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161) Thanks [@crs48](https://github.com/crs48)! - Materialized views can now coexist with read authorization. Each
  materialization is stamped with a reload-stable authorization fingerprint
  (subject + grant-state version), so a view is authorized once at refresh and
  served from the persisted cache without per-row re-checks — while any grant
  change forces an `authz-changed` re-materialization. The cached id list can
  never serve a row a revoked viewer may no longer read. Adds a nullable
  `auth_fingerprint` column to `node_query_materializations` (schema v7, applied
  to existing databases via a defensive column guard) plus optional
  `setNodeReadAuthorizer` / `getAuthorizationStateVersion` storage-adapter seams.

- [#278](https://github.com/crs48/xNet/pull/278) [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7) Thanks [@crs48](https://github.com/crs48)! - Fix the cold-start boot stall and silent registry persistence failure (exploration 0227).

  Workspace presence Y.Docs (`presence-*`) are now in-memory only — never
  cold-loaded from `yjs_state` nor persisted back — so presence-doc warming no
  longer head-of-line blocks the landing read queries on the single SQLite worker
  at boot. `NodePoolConfig` gains `isEphemeral` and `largeDocWarnBytes` options.

  The sync registry now persists its tracked-node set through a new FK-free
  app-state key/value (`getAppState`/`setAppState` on the storage adapter, backed
  by `sync_state`) instead of `yjs_state`, fixing a `SQLITE_CONSTRAINT_FOREIGNKEY`
  (787) that silently prevented the registry from ever persisting.

- [#360](https://github.com/crs48/xNet/pull/360) [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538) Thanks [@crs48](https://github.com/crs48)! - Change-log compaction — the durable cold-open fix (exploration 0254 / F3).

  The local `changes` log grows monotonically and never shrinks (~424k rows on affected
  workspaces), which bloats the OPFS file (slow cold SQLite open) and the first
  outbound-resync slice. Because current state is fully materialized in
  `nodes`/`node_properties` and reads never replay the log, the log is a non-authoritative
  cache of history the hub holds — so it can be safely GC'd.
  - **`@xnetjs/data`**: adds `SQLiteNodeStorageAdapter.pruneSupersededChanges(wsafe, opts)`
    and `getMinConfirmedSyncCursor()`. `pruneSupersededChanges` deletes only _superseded_
    history — rows below the confirmed-durable sync floor that are neither a node's
    hash-chain tip (kept so `getLastChange`/`parentHash` chaining is unchanged) nor the LWW
    provenance of a currently-winning property value (kept so every live value stays
    re-pushable). It runs chunked, yields between chunks, and never throws. Convergence with
    peers that never compacted is preserved by construction; only rows are deleted, never
    rewritten.
  - **`@xnetjs/runtime`**: `NodeStoreSyncProvider` now guards against a hub high-water mark
    regressing below the confirmed cursor (a hub rollback / repointed empty hub) by
    re-offering local changes from the hub's real mark.

  The web app schedules compaction on idle boot (behind the `xnet:compact:changes=off` kill
  switch); freed pages are reclaimed by the existing idle VACUUM.

- [#331](https://github.com/crs48/xNet/pull/331) [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702) Thanks [@crs48](https://github.com/crs48)! - Add account/device content-key re-wrap to `computeRecipients` (exploration 0243, P2.3).
  A new optional `expandDeviceRecipients` dependency lets each DID recipient expand to
  every _currently active_ device of the account it belongs to, so a user's content is
  decryptable on all their devices: admitting a device (a `DeviceRecord`) makes it a
  recipient on the next recompute, and revoking it removes it from future re-wraps.
  Build the function from ledger records with the new `deviceRecipientExpander`. When the
  dependency is omitted, recipients are exactly the resolved DIDs (no behavior change),
  and an identity that belongs to no account expands to only itself — so an unrelated DID
  never gains access to another account's data.

- [#283](https://github.com/crs48/xNet/pull/283) [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47) Thanks [@crs48](https://github.com/crs48)! - Extend the map layer-source model for richer GIS layers (exploration 0230).

  `MapLayerSource` gains two new kinds — `raster` (an XYZ imagery/topo tile
  overlay) and `pmtiles` (a self-hosted vector tileset referenced by BlobStore
  content id) — and the reserved `query` kind now carries an optional `where`
  filter and `tooltip` property keys. `MapBasemapId` adds a key-less `satellite`
  basemap. All additive; existing inline-GeoJSON maps are unaffected.

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

### Patch Changes

- [#382](https://github.com/crs48/xNet/pull/382) [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b) Thanks [@crs48](https://github.com/crs48)! - SQLite worker-queue upgrades from the local-first field survey (exploration 0263).

  **@xnetjs/sqlite** — multi-tab leadership: tabs now elect a leader via Web Locks
  (`navigator.locks`) and other tabs route storage RPCs to the leader's SQLite
  worker through a SharedWorker port ferry, instead of the second tab silently
  falling back to a non-durable `:memory:` database. Leader death promotes a
  follower (in-flight follower calls reject immediately; idempotent reads retry
  automatically); abandoned manual transactions roll back on the next client
  connect; `multiTab: false` opts out and unsupported browsers keep the previous
  per-tab behaviour. Also new: a prepared-statement LRU on the web adapter's hot
  path (replacing per-call `db.exec` parsing), a `queryBatch(reads[])` adapter/
  RPC API that executes several reads in one worker round-trip, per-lane
  scheduler latency stats (`getSchedulerOpStats()`: queue/exec p50/p95, coalesce
  hits), and `:memory:`-fallback session counters.

  **@xnetjs/data-bridge** — read-set-scoped invalidation (store changes for
  schemas no cached query observes are dropped before any delta work), bulk
  changes now reload only subscribed entries while unwatched entries serve
  stale-while-revalidate, and `QueryCache` gains row-weight-aware eviction
  (200 entries / 50k cached rows) plus hit/miss/eviction stats via
  `getQueryCacheStats()`.

  **@xnetjs/data** — `getNode()` collapses to one joined query (was two worker
  round-trips) and multi-chunk node hydrates ride a single `queryBatch` RPC.

- Updated dependencies [[`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`985ac8f`](https://github.com/crs48/xNet/commit/985ac8f73ce3539e561cc03ab0c5d3b2a61d6029), [`d4bfe27`](https://github.com/crs48/xNet/commit/d4bfe2775d80d28afec11799edd911b9529c8bfe), [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`22ab91d`](https://github.com/crs48/xNet/commit/22ab91dc3e979446a87e84fbf0a8258276c309f0), [`b320a06`](https://github.com/crs48/xNet/commit/b320a062c1d4485e2756fae87cad5a016d4eb5ed), [`7e6f5b7`](https://github.com/crs48/xNet/commit/7e6f5b73b6dfad38d645d0be25cd11670211e999), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`3261a75`](https://github.com/crs48/xNet/commit/3261a7500df87f5c24baba2d0f6f389f7ff8ebf7), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`b0cd77c`](https://github.com/crs48/xNet/commit/b0cd77c2612f1a6540ead9e4edb9916b6d09cb66), [`142b1c0`](https://github.com/crs48/xNet/commit/142b1c05d80f5f7fe46ed80cd5bafc0fe9c14630), [`0e0802d`](https://github.com/crs48/xNet/commit/0e0802dc22a64703ca54168a4a731cd1d34a54bf), [`839b2b7`](https://github.com/crs48/xNet/commit/839b2b73373ea774438fbf624690eae3d368ceab), [`d9008d2`](https://github.com/crs48/xNet/commit/d9008d2f2332129b367746ae7991be144fb7d8e1), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/sqlite@0.1.0
  - @xnetjs/identity@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/storage@0.1.0
  - @xnetjs/sync@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/storage@0.0.3
  - @xnetjs/sqlite@0.0.3
  - @xnetjs/sync@0.0.3
  - @xnetjs/identity@0.0.3
  - @xnetjs/crypto@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/identity@0.0.2
  - @xnetjs/storage@0.0.2
  - @xnetjs/crypto@0.0.2
  - @xnetjs/sqlite@0.0.2
  - @xnetjs/core@0.0.2
  - @xnetjs/sync@0.0.2
