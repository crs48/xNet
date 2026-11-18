# Desktop beta

Download at [xnet.fyi/download](https://xnet.fyi/download/). The beta supports Apple silicon and Intel Macs, Windows x64, and Linux x64. Linux packages target Ubuntu 24.04 / glibc 2.39 or newer; older distributions are not supported by these builds. There is no mobile release or Windows/Linux ARM release yet.

## Signing and installation

Every installer has an adjacent `.sig` and a SHA-256 entry in the release's `SHA256SUMS`. Signatures use the existing xNet beta updater key; the matching private key is held in the repository's encrypted `TAURI_SIGNING_PRIVATE_KEY` secret and backed up outside the repository. Never rotate it just to make a build pass.

These are self-signed beta downloads, not verified-publisher releases:

- macOS application bundles use ad-hoc signing and are not notarized. Copy the app from the disk image to Applications. Gatekeeper may require an explicit exception in System Settings → Privacy & Security; do not disable Gatekeeper globally.
- Windows installers have xNet update signatures but no Authenticode publisher certificate. SmartScreen may warn or a managed device may block installation. No certificate needs to be installed into the user's trusted roots.
- Linux offers a Debian package and AppImage. Use `sudo apt install ./xnet-community-0.1.2-linux-x64.deb` to resolve dependencies. AppImage needs executable permission and FUSE 2; it does not remove the minimum glibc requirement.

Updater signatures authenticate xNet's artifacts. They do not establish Apple or Microsoft publisher identity. See [Tauri's updater](https://v2.tauri.app/plugin/updater/) and [macOS signing documentation](https://v2.tauri.app/distribute/sign/macos/).

## Try messaging

1. Install the build for your computer and choose a local name. Each installation generates its own device identity. Review and enable hosting. An admitted device can invite a new one over the public relay; see [hub and sharing](../deploy/hub/README.md).
2. Under **Chats**, make an invite-only room. Send its invitation directly to the intended recipient. They can paste the full link into **Open a link**. Hosted links offer **Open in xNet** and carry the invitation in the URL fragment. Opening a link does not automatically join.
3. Message in both directions, then try a separate room with three people. Quit and reopen the owner's app and send again. Anyone holding an invitation can potentially join: a two-person room is not a recipient-bound DM. The owner can require approval or rotate the invitation.

The owner must be reachable for new messages. **Earlier messages** loads history from a directly reachable, authorized peer. A member can share history for up to five minutes after the owner last issued permission; a disconnected peer can miss a removal during that window. No server stores private chat history.

This beta does not provide offline outgoing queues, account recovery, import from Electron, guaranteed connectivity across routers, or a forward-secret group ratchet. The room host can read its rooms. Local history is not a delivery receipt, encrypted backup, or protection against losing your last device. Keep this beta separate from the retired Electron app.

## Build locally

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), pinned Rust toolchain, Node 24, and pnpm 10.30.3:

```sh
pnpm install --frozen-lockfile
pnpm desktop:build --bundles dmg # macOS; nsis on Windows; deb,appimage on Linux
```

Ordinary local builds have no updater endpoint. For a beta build, set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, then add `--config src-tauri/beta.conf.json`. On Mac, request `--bundles app,dmg` so Tauri retains the app and generates its updater archive. Set `APPLE_SIGNING_IDENTITY=-` for the intentionally ad-hoc Mac beta. Keep secrets out of source and shell history.

## Publish the next beta

The manual **Release Desktop Beta** workflow owns releases. A main merge alone never advances the update channel.

1. Bump `package.json`, the Cargo workspace and its lockfile entries, and `tauri.conf.json` to the same unused version. Merge through normal required CI.
2. Dispatch `desktop-build.yml` on `main` with `publish=false` for a rehearsal, or `publish=true` to release. A publishing dispatch on another branch is rejected.
3. Four native runners build real release binaries and exercise private/group messaging, restart persistence, and profile isolation. Every installer and updater payload is signed. macOS disk images receive an additional detached xNet signature.
4. The verification job requires the complete asset set, verifies every signature with the pinned public key, and checks its signed version. Missing or extra files and mismatched versions fail the release. Its `--selftest` runs negative controls in memory.
5. Publishing creates a draft GitHub prerelease named `community-v<version>`, uploads all files and checksums, then makes it public. Only afterward does it advance the small `latest.json` and `downloads.json` files at `https://xnet.fyi/releases/community/beta/`. Binary assets live on GitHub Releases, not in the website Git history.
6. Check the live download page and download an installer. The site reads the release manifest at runtime, so future releases do not require changing the page. It shows a clear unavailable state rather than broken buttons when no complete release is available.

Assets and version tags are immutable. If publishing fails after creating a draft, inspect that draft and the run before retrying; do not overwrite a published artifact. Use a new patch version for a changed binary. Keep old releases available for in-progress downloads. The existing update URL, public key, URI scheme, and application identifier remain stable.

While a beta app is open, it checks on launch, on reconnection, and every six hours. It downloads a newer verified update in the background and waits for **Restart to update**. Closed apps do not poll. Linux system packages can ask for administrator authorization. Installing updates is a separate check from building packages; the release runtime tests alone do not verify OS installation or an in-place upgrade on every platform.

## Repeat the native messaging check

```sh
python3 scripts/check-desktop-chat.py '/Applications/xNet Community.app' --loopback
```

This opens three isolated packaged desktop processes, exercises their authenticated control bridges, and stops them afterward. It never reads your normal profile. `--loopback` removes LAN/VPN routing from this local test. Public-router connectivity is a separate [hosted hub check](../scripts/check-hosted-hub.py).
