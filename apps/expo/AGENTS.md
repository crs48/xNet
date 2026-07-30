# apps/expo — mobile surface

Loaded on demand when an agent reads files here. Root `AGENTS.md` still applies.

Mobile is the **last** target: land a feature in Electron first, then Web, then
here.

## Runtime constraints

- **No Node APIs.** No `fs`, `path`, `child_process`, or anything that assumes a
  Node runtime — this is React Native, not a browser and not Node.
- Storage goes through the `@xnetjs/*` adapters, never a direct SQLite or OPFS
  call copied from web or desktop.
- Web-only browser globals (`window.xnet*`, `document`, OPFS) do not exist.

## Build

Expo + EAS (`eas.json`). Start the dev server with:

```bash
pnpm --filter xnet-mobile start
```

There is no Playwright loop here. Verify on a simulator/device, and say so
plainly when a change could not be verified that way.
