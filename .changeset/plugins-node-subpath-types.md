---
'@xnetjs/plugins': patch
---

`@xnetjs/plugins/node` now reliably ships its type declarations. The two bundles
were built concurrently into overlapping output directories, so the main
bundle's clean step could delete `dist/services/node.d.ts` after the Node bundle
had written it — and the build still exited 0. A published package could
therefore carry `dist/services/node.js` with no declarations beside it, leaving
consumers to resolve the subpath as untyped JavaScript.
