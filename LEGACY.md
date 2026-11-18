# The xNet transition

On November 18, 2026, xNet made the Rust/Tauri community network its primary
product. The earlier Electron workspace and CRDT SDK are retired, not maintained
in parallel. No old package is unpublished and no Git history is rewritten.

| What you need | Preserved location |
| --- | --- |
| Last legacy main, including published essays | [legacy-sdk-2026-11-18](https://github.com/crs48/xNet/tree/legacy-sdk-2026-11-18) |
| Unfinished chat/agent/Electron work and explorations | [archival snapshot b57516c](https://github.com/crs48/xNet/tree/b57516c781dd089cf9568784b98d33f4b159dfe9) |
| Prototype before promotion | [45cfce278](https://github.com/crs48/xNet/tree/45cfce2787c45bca542a13e356ca3b76529acaa1/experiments/community-network) |
| Historical developer documentation | [archived docs](https://github.com/crs48/xNet/tree/legacy-sdk-2026-11-18/site/src/content/docs) |
| Earlier decisions and research | [archived explorations](https://github.com/crs48/xNet/tree/b57516c781dd089cf9568784b98d33f4b159dfe9/docs) |

The archival snapshot saves unfinished source; it is not a validated release.
Local profiles, keys, databases, build products, and screenshots remain in their
original local worktree and were not published. Existing worktrees are untouched.

## What changes

The active tree contains the desktop app, Rust services, Chrome bridge, a small
hub deployment, and the consumer website. It has no runtime dependency on the
old TypeScript packages. Source moves do not change the new app's profile ID,
wire protocol, update key, or URI scheme.

The new app does **not** import Electron databases. Keep the old installation
and its data if you still need them. There is no automatic conversion or feature
parity promise for documents, canvases, CRM, or agent extensions.

Every published essay keeps its URL, artwork, authors, and publication date.
Essays from the workspace era are labeled accordingly. Old documentation URLs
lead to an archive notice. The public developer portal is retired; contributor
and operating instructions live with the code.

## Rollback

The legacy tag and archive branch are permanent recovery points. Revert the
migration using a new reviewed commit to restore the old active tree; do not
reset or force-push main. Re-enable legacy CI only together with that tree.
Revert a hub deployment independently using the previous Railway deployment and
its backed-up volume. Do not point legacy services at a new app profile.

Changing main does not publish installers or advance the signed update feed.
Desktop releases require their own reviewed release step and platform validation.
