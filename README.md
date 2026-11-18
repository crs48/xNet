# xNet

Private conversations. Shared music and video. A network kept by the people using it.

xNet is an open-source desktop app for friends and communities. Keep your chats
on your device, connect directly to other people, and choose how much storage
and bandwidth to contribute. The same app has private rooms, community chats,
public posts, video, and music.

[Download for macOS, Windows, or Linux](https://xnet.fyi/download/).

**Early beta.** The Tauri app is now the primary product. This repository no
longer maintains the Electron workspace or publishes the old TypeScript SDK.
The vision, essays, branding, and previous source remain available:
[the transition and archive](LEGACY.md), [the blog](https://xnet.fyi/blog).

## Run it

Install [Tauri's native prerequisites](https://v2.tauri.app/start/prerequisites/),
Node 24, pnpm 10.30.3, and Rust via rustup. Then:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The app uses the existing shared hub by default. To use a local tracker:

```sh
pnpm registry --bind 127.0.0.1:4380 --database .local/registry.sqlite
# In another terminal:
XNET_COMMUNITY_REGISTRY=http://127.0.0.1:4380 pnpm dev
```

Windows PowerShell: set `$env:XNET_COMMUNITY_REGISTRY` before `pnpm dev`.
The tracker indexes metadata and public text; it does not host media or private
chat history. Media and history require an online authorized peer. Small live
chat/control messages may use the relay when a direct connection is unavailable.

## Build and contribute

```sh
pnpm build
pnpm test
pnpm desktop:build
pnpm --dir site install --frozen-lockfile
pnpm site:build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and platform checks,
[the beta guide](docs/beta.md) for packaging and known limits, and
[hub hosting](deploy/hub/README.md) for self-hosting. The browser extension in
`extension/` connects to the desktop; it is not a separate peer or web app.

No seamless account recovery, mobile app, or queued offline sending yet. The
current group protocol has no forward-secret ratchet. Review the beta guide
before trusting it with important or sensitive conversations.

MIT licensed. Existing published `@xnetjs/*` packages remain historical releases;
they are not dependencies of this app.
