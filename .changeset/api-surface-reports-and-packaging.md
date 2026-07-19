---
'@xnetjs/abuse': patch
'@xnetjs/billing': patch
'@xnetjs/cli': patch
'@xnetjs/core': patch
'@xnetjs/crypto': patch
'@xnetjs/data': patch
'@xnetjs/data-bridge': patch
'@xnetjs/devkit': patch
'@xnetjs/history': patch
'@xnetjs/identity': patch
'@xnetjs/plugins': patch
'@xnetjs/react': patch
'@xnetjs/runtime': patch
'@xnetjs/slack-compat': patch
'@xnetjs/sqlite': patch
'@xnetjs/storage': patch
'@xnetjs/sync': patch
'@xnetjs/trust': patch
---

Fix TypeScript type resolution for every package's export map, and ship
`@xnetjs/data/portability`.

`types` was ordered after `import` in 48 export subpaths across 19 packages.
Export conditions are order-sensitive, so TypeScript could resolve the wrong
entry — or no types at all — depending on the consumer's `moduleResolution`.
`types` is now first everywhere.

`@xnetjs/data` also advertised a `./portability` subpath that was never added to
its build, so `@xnetjs/data/portability` — the `.xnetpack` export/import codec —
did not resolve at all for consumers. It now builds and ships.

Both were found by adding `publint` to CI.
