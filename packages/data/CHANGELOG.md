# @xnetjs/data

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

### Patch Changes

- Updated dependencies [[`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`985ac8f`](https://github.com/crs48/xNet/commit/985ac8f73ce3539e561cc03ab0c5d3b2a61d6029), [`d4bfe27`](https://github.com/crs48/xNet/commit/d4bfe2775d80d28afec11799edd911b9529c8bfe), [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`7e6f5b7`](https://github.com/crs48/xNet/commit/7e6f5b73b6dfad38d645d0be25cd11670211e999), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`3261a75`](https://github.com/crs48/xNet/commit/3261a7500df87f5c24baba2d0f6f389f7ff8ebf7), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`b0cd77c`](https://github.com/crs48/xNet/commit/b0cd77c2612f1a6540ead9e4edb9916b6d09cb66), [`142b1c0`](https://github.com/crs48/xNet/commit/142b1c05d80f5f7fe46ed80cd5bafc0fe9c14630), [`0e0802d`](https://github.com/crs48/xNet/commit/0e0802dc22a64703ca54168a4a731cd1d34a54bf), [`839b2b7`](https://github.com/crs48/xNet/commit/839b2b73373ea774438fbf624690eae3d368ceab), [`d9008d2`](https://github.com/crs48/xNet/commit/d9008d2f2332129b367746ae7991be144fb7d8e1), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
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
