---
'@xnetjs/trust': patch
'@xnetjs/slack-compat': patch
'@xnetjs/billing': patch
'@xnetjs/devkit': patch
---

First public release. These MIT packages are runtime or public-API dependencies
of already-published packages (`@xnetjs/plugins` → `trust` + `slack-compat`,
`@xnetjs/react` → `billing`, `@xnetjs/cli` → `devkit`), so publishing them closes
the dependency graph and lets those packages install cleanly from npm.
