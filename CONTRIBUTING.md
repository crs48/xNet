# Contributing to xNet

Use Node 24, pnpm 10.30.3, Python 3, and rustup. `rust-toolchain.toml` pins Rust.
The desktop needs [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):
Xcode command-line tools on macOS, MSVC and WebView2 on Windows, or WebKitGTK 4.1
and the GTK development libraries on Linux.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm build
pnpm test
```

`pnpm dev:ui` starts only Vite; native operations require Tauri. Rust crate names,
profile IDs, and the `xnet-community://` scheme remain stable for existing testers.
The app uses the existing hosted tracker by default; README.md explains local mode.

## Independent processes

`crates/network` owns signed peer operations, SQLite, bounded retention, and the
local bridge. `crates/registry` exposes public metadata and discovery;
`crates/node` is the Chrome native messaging host. `apps/desktop` owns the native
window and React/shadcn UI. `deploy/hub` packages the registry and optional relay.
`site` has its own package.json and lockfile, with no app package dependency.

```sh
pnpm --dir site install --frozen-lockfile
pnpm site:build
pnpm desktop:build
python3 scripts/check-desktop-chat.py target/release/community-desktop --loopback
```

On macOS the executable is also inside `target/release/bundle/macos/xNet Community.app`.
On Windows use `target/release/community-desktop.exe`. On headless Linux run the
chat check under `xvfb-run -a`. It creates three temporary profiles, verifies
private/group messaging, restart durability and authorized offline-owner history,
and cleans up its own processes. Never reuse your real profile for tests.

## CI and delivery

The required `quality`, `network`, `desktop`, `site`, and `hub` checks run for
every PR, including docs-only changes. Desktop aggregates native builds and peer
checks on macOS, Windows and Linux. Hub builds the exact staged Docker context
and verifies tracker/relay modes. Site verifies complete output, blog preservation,
and archived documentation routes. The repository invariant check has an in-memory
negative control (`node scripts/check-repository.mjs --selftest`).

`changelog-section` requires a fragment under `site/src/data/changelog/` or the
`skip-changelog` PR label. Use `node scripts/changelog/new.mjs` to write one.
See [the beta guide](docs/beta.md) for signed release preparation. CI artifacts
are not consumer releases. Do not replace the update key or publish `latest.json`
as a side effect of a merge.
