# @xnetjs/labs

Code as a first-class citizen in xNet — a **Lab** node type, a layered
**runtime ladder** for executing code safely, and a **Lab → Extension**
publisher that hot-installs authored code into the running workbench
(exploration [0180](../../docs/explorations/0180_[_]_CODE_AS_A_FIRST_CLASS_CITIZEN_LABS_AND_RUNTIMES.md)).

## What it provides

- **`LabSchema`** — a Lab is a node (like a Page/Canvas) holding `code`,
  `language`, `runtime` tier, and its last output. Syncs over P2P.
- **Runtime ladder** — pick an engine by `(language, tier)`, with the
  load-bearing rule that computed/`onView` Labs may only use a *deterministic*
  rung:
  - `sesRuntime` — SES `Compartment`, deterministic JS, always available.
  - `quickjsRuntime` — QuickJS-WASM with **hard CPU/memory limits** (the Figma
    model). Kills `while(true)` via an interrupt handler.
  - `appRuntime` — DOM mini-apps in a sandboxed iframe (host-driven,
    non-deterministic).
  - `pythonRuntime` — Pyodide-in-a-Worker (seam; inject a loader).
  - `createServerRuntime` — Rust/C compile-then-run behind an injected backend.
- **Host bridge** (`createLabHostBridge`) — the permission-gated `xnet` global
  exposed to Lab code, mirroring the MCP `query`/`get` tools.
- **Transpilation** (`Transpiler`) — `identityTranspiler` for JS; inject
  `createSwcTranspiler(swc)` for TypeScript/JSX in the browser.
- **Trust** (`deriveTrustTier`) — capability follows provenance, never
  self-declaration; synced nodes never inherit elevated trust.
- **Publishing** (`buildLabExtensionManifest`, `publishLabAsExtension`) — turn a
  Lab into a valid `XNetExtension` and hot-install it via the `PluginRegistry`.

## Usage

```typescript
import { createDefaultLadder, createLabHostBridge } from '@xnetjs/labs'

const ladder = createDefaultLadder()
const result = await ladder.run({
  code: 'console.log("hi"); return 6 * 7',
  language: 'javascript',
  tier: 'sandbox'
})
// → { ok: true, value: 42, logs: [{ level: 'log', message: 'hi' }], engine: 'quickjs' }
```

```typescript
// Run with permission-gated data access:
const host = createLabHostBridge({
  store,
  permissions: { schemas: { read: ['xnet://xnet.fyi/Task@1.0.0'] } }
})
await ladder.run({
  code: 'const t = await xnet.query({ schema: "xnet://xnet.fyi/Task@1.0.0" }); return t.length',
  language: 'javascript',
  tier: 'sandbox',
  host
})
```

## Notes

- The heavy runtimes are lazy/injected so this package stays node-safe and
  testable: QuickJS is dynamically imported; Pyodide and `@swc/wasm-web` are
  supplied by the host; the server backend is an interface.
- In-process SES cannot interrupt a *synchronous* busy loop — that is what the
  terminable Worker (`runtime/worker.ts`) and the QuickJS rung are for.
