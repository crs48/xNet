# @xnetjs/native-bridge-extension

**Spike — exploration [0289](../../docs/explorations/0289_%5B_%5D_SECURELY_CONNECTING_THE_BROWSER_TO_A_LOCAL_MODEL.md), Option C.** A browser
extension + native-messaging host that lets the **pure-web PWA**
(`https://xnet.fyi/app`, no bundled Electron host) reach a **local model** with
the strongest origin binding available in a browser — **no loopback HTTP port,
no CORS, no DNS-rebinding surface** (the 1Password pattern).

This is a proof-of-concept, not a shipped product: `private: true`, no build
step, no changeset. It exists to (a) prove the transport works end-to-end and
(b) compare its UX against the copy-paste **pairing code** shipped for 0289
Option B (the hardened loopback bridge).

## Why this exists

0289 Option B hardened the loopback daemon (`packages/devkit/src/bridge-server.ts`)
into a secure spine: `Host`-header validation, an origin allowlist, and a
**per-launch pairing token** the user copies from `xnet bridge serve` into the AI
settings. That token is the layer that survives DNS-rebinding and drive-by sites
_because loopback-bind + origin allowlist alone cannot_ — any site can be made to
resolve to `127.0.0.1`.

Option C removes the attack surface instead of defending it. The page never makes
a network request to `localhost`; it talks to an **extension** that the OS has
bound, by ID, to a **native host**. There is no port to rebind to and no CORS to
misconfigure.

## Architecture

```
 https://xnet.fyi/app (page)
   │  chrome.runtime.sendMessage(<extId>, {v:1, kind, …})     ← gated by
   ▼                                                            externally_connectable
 background.js (extension service worker)                       (origin allowlist)
   │  chrome.runtime.connectNative('fyi.xnet.bridge')          ← gated by the native
   ▼                                                            host manifest's
 xnet-bridge-host.mjs (native messaging host)                   allowed_origins = <extId>
   │  stdio, 4-byte-LE-length-prefixed JSON frames              (OS-enforced)
   ▼
 backend:
   • cli    → spawn the user's `claude` / `codex` (NO port anywhere)   [default]
   • daemon → forward to the hardened bridge daemon over loopback,
              carrying its pairing token (reuse MCP tools / /run / Ollama proxy)
```

Two OS-/browser-enforced allowlists, and that's the whole trust story:

1. **`externally_connectable.matches`** (`extension/manifest.json`) — only the
   deployed PWA origin (+ loopback for dev) may deliver a message to the
   extension. `background.js` re-checks `sender.origin` as defence in depth.
2. **`allowed_origins`** in the native host manifest — pinned to _this
   extension's ID_, so the OS refuses to launch the host for any other
   extension. The ID is derived deterministically from the extension's public
   `key` (see `scripts/crx-id.mjs`), so it's stable across machines.

## Layout

| Path                            | What it is                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `extension/manifest.json`       | MV3 manifest — `externally_connectable`, `nativeMessaging`, a fixed `key` (→ stable ID)   |
| `extension/background.js`       | Service-worker relay: page ↔ native host, origin-checked                                  |
| `host/native-messaging.mjs`     | The 4-byte-length framing codec (one source of truth)                                     |
| `host/relay.mjs`                | `handleMessage(msg, backend)` — transport-free, never throws                              |
| `host/backends.mjs`             | `cliBackend` (spawn CLI) and `daemonBackend` (forward to `:31416`)                        |
| `host/xnet-bridge-host.mjs`     | The runnable native host — stdin → relay → stdout                                         |
| `host/manifest.template.json`   | Native host manifest template (`__HOST_PATH__`, `__EXTENSION_ORIGIN__`)                   |
| `web/extension-connector.mjs`   | Page-side client — mirrors the `ChatAgent` contract so it slots into the connector ladder |
| `scripts/gen-extension-key.mjs` | Mint the signing key; bake the public `key` (→ stable ID) into the manifest               |
| `scripts/install-host.mjs`      | Write the native host manifest to the browser's `NativeMessagingHosts` dir                |
| `scripts/crx-id.mjs`            | Derive the Chromium extension ID from the packed public key                               |

## Try it (macOS / Linux, Chromium-family)

```bash
cd packages/native-bridge-extension
node scripts/gen-extension-key.mjs        # once — prints the stable extension ID
node scripts/install-host.mjs             # writes ~/…/NativeMessagingHosts/fyi.xnet.bridge.json
#   --browser chrome|chromium|brave|edge  (default: chrome)
```

Then load the unpacked extension: `chrome://extensions` → Developer mode → **Load
unpacked** → select `./extension`. Confirm the ID matches what `gen` printed.
Reload the xNet tab; the page can now call the connector in `web/`.

Backend selection is by environment (set in your shell or the host manifest):

```bash
# default — spawn the user's coding-agent CLI, no port anywhere:
XNET_BRIDGE_MODE=cli XNET_BRIDGE_AGENT=claude

# or reuse the already-hardened loopback daemon (MCP tools, /run, Ollama proxy):
XNET_BRIDGE_MODE=daemon XNET_BRIDGE_URL=http://127.0.0.1:31416 XNET_BRIDGE_TOKEN=<pairing code>
```

**Windows** uses a registry key instead of a manifest file
(`HKCU\Software\Google\Chrome\NativeMessagingHosts\fyi.xnet.bridge` → the manifest
path), and the host needs a `.bat`/`.cmd` launcher since Windows can't exec a
`.mjs` directly. Out of scope for this spike; noted for a productionization pass.

## UX comparison: pairing code (0289 B) vs. this extension (0289 C)

|                           | **Pairing code** (shipped, Option B)                                                                                               | **Extension + native messaging** (this spike, Option C)                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **First-run steps**       | Install a CLI (or Electron) · run `xnet bridge serve` · **copy a code** · paste it into AI settings                                | Install the extension (one click from a store) · run the host installer once       |
| **Recurring friction**    | Token is **per-launch** — the code changes every time the daemon restarts, so the user re-pastes (or pins `--token`, weakening it) | **None** — the OS↔extension binding is durable; nothing to re-enter                |
| **What the user handles** | A secret they must not paste into the wrong site                                                                                   | Nothing secret ever crosses the page boundary                                      |
| **Failure mode**          | Wrong/expired code → silent 401; "why is it broken?"                                                                               | Extension missing → detectable, actionable "install the extension" prompt          |
| **Security ceiling**      | Defends the surface: token + `Host` + origin on an open loopback port                                                              | Removes the surface: no port, no CORS, no rebinding; OS-pinned extension ID        |
| **Browser gates (LNA)**   | Subject to Chrome 142+/Firefox `loopback-network` permission prompts                                                               | Unaffected — no local-network request is ever made                                 |
| **Ship cost**             | Already merged; zero new artifacts                                                                                                 | Ship + maintain an extension per browser store + a native-host installer           |
| **Cross-browser**         | Any browser (server-side auth is the floor)                                                                                        | Chromium family + Firefox (WebKit/Safari has no extension native-messaging parity) |

**Takeaway.** The pairing code is the right **now**: no artifacts to distribute,
works on every browser, already shipped. Its recurring cost is the per-launch
re-paste and the "silent 401" failure mode. The extension is the right
**strategic** answer for the deployed PWA: after a one-time install it's
zero-friction and zero-secret forever, and it's the only option that _eliminates_
the loopback attack surface rather than guarding it — at the cost of building and
maintaining a per-browser extension + native-host installer. Recommend keeping B
as the default and pursuing C as an opt-in "install the xNet bridge extension"
upgrade once there's demand for a browser-only install with no bundled daemon.

## Tests

```bash
pnpm vitest run --project integration packages/native-bridge-extension
```

Covers the framing codec (partial/multi/oversize frames, multibyte UTF-8), the
relay + both backends (including a round-trip through the **real hardened bridge
daemon** with its pairing token), the page-side protocol against a fake `chrome`,
the extension-ID derivation, and a **real-process end-to-end** run that spawns
`xnet-bridge-host.mjs` and drives it with native-messaging frames.
