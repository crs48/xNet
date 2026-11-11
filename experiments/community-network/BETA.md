# Friends beta: desktop installers

The first test is a conversation between two devices, followed by an invite-only group. macOS uses an Apple silicon disk image; Windows uses an x64 NSIS installer; Debian and Ubuntu use an amd64 Debian package. The Linux build targets Debian 12 with WebKitGTK 4.1. This is a local test release; there is no public download or live update feed yet.

## Try messaging

1. Install the build for your computer. On Mac, copy the app from the disk image into Applications before updating. On Linux, use the package manager (for example, `sudo apt install ./xnet-community-0.1.0-linux-amd64.deb`) so it resolves the WebKitGTK and GTK dependencies.
2. Open the app, choose a local name and review the hosting setting. Each installation generates its own device identity. Use builds with community hub support and enable hosting. An admitted device can invite a new one over the public relay. See the [hub and sharing guide](../../deploy/community-hub/README.md).
3. Under **Chats**, make an invite-only room. Copy the invitation and send it directly to the intended recipient. They can paste the full link into **Open a link** in the app. The hosted link offers **Open in xNet** and carries the room invitation in its URL fragment. Opening the link leaves joining up to the recipient.
4. Message in both directions, then try a separate room with three people. Quit and reopen the owner’s app and send again. Everyone with an invitation can potentially join: a room with two people is not a recipient-bound DM. The owner can require approval or rotate the invitation.

The owner must be reachable to deliver messages. The prototype does not queue outgoing messages for later delivery, provide offline store-and-forward, or guarantee connectivity across different routers. The host can read its rooms. Local history is distinct from a delivery receipt, an encrypted backup or recovery after losing a device. Keep the three-platform beta separate from existing xNet app installations.

## Build on each operating system

Install the [Tauri prerequisites for that OS](https://v2.tauri.app/start/prerequisites/), current stable Rust, Node 22.12+ and pnpm 10. From this experiment directory:

```sh
pnpm install --ignore-workspace --frozen-lockfile
pnpm desktop:build
```

This produces a build without an update endpoint. On Windows use the x64 MSVC toolchain and WebView2; on Debian/Ubuntu provide the WebKitGTK 4.1 development libraries. Outputs are under the Cargo target directory, in `release/bundle` (or `<triple>/release/bundle` for explicit targets). Linux builds only a Debian package for this beta. For Windows from a Mac see [Tauri’s NSIS cross-compilation instructions](https://v2.tauri.app/distribute/windows-installer/); check the resulting installer on real Windows before inviting a Windows user.

For the beta edition, give the build process `TAURI_SIGNING_PRIVATE_KEY` (a path to the beta signing key) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, then run:

```sh
pnpm desktop:build --config src-tauri/beta.conf.json
```

Only the public key belongs in the repository. Keep the private key in protected storage with a separate backup. Updater signatures verify releases inside the app; they do not provide Apple notarization or Windows publisher identity. The current Mac beta is ad-hoc signed and the Windows installer is not Authenticode signed. Use a Developer ID Application certificate and notarization for Mac distribution, and configure Windows publisher signing before a wider release.

## Prepare an update

Increment the desktop version for each new release. Keep the native package version, Tauri configuration and JS package version consistent. Build all three platforms with the same public key. The official Tauri build signs update artifacts; if the signing key is held on a separate machine, sign the exact packaged artifact there with `tauri signer sign --app-version <version> --private-key-path <key> <artifact>`. For Linux, use the Tauri-produced Debian package (the binary inside carries its installer type).

Run the following with Python 3 and [minisign](https://jedisct1.github.io/minisign/) on the machine staging the release. The script requires adjacent Tauri `.sig` files, verifies all three payloads with the pinned public key and their signed version, and refuses an existing output directory.

```sh
python3 scripts/prepare-beta-feed.py --output /path/to/new-release-directory \
  --mac '/build/macos/xNet Community.app.tar.gz' --dmg '/build/dmg/xNet Community_0.1.0_aarch64.dmg' \
  --windows '/build/nsis/xNet Community_0.1.0_x64-setup.exe' --linux '/build/deb/xNet Community_0.1.0_amd64.deb'
```

Preparing the folder does not publish anything. To enable updates later, serve the version directory under the configured HTTPS path, then replace `latest.json` last. Keep previous version directories so an in-progress download remains valid. While the signed-in app is running it checks on launch, when connectivity returns, and every six hours. Newer signed builds download without interrupting chat; **Restart to update** installs them when the user chooses. A closed app does not poll. Linux may ask for OS authorization to replace a system package.

## Repeat the local messaging check

```sh
python3 scripts/check-desktop-chat.py '/Applications/xNet Community.app'
# Explicit loopback isolates the same test from LAN/VPN routing.
python3 scripts/check-desktop-chat.py --loopback /usr/bin/community-desktop
```

The script opens three packaged desktop processes with independent temporary profiles, exercises their real authenticated control bridges, and stops them afterwards. It never reads the user’s profile. For release evidence and outstanding checks, see [VERIFICATION.md](VERIFICATION.md).
