# xNet plugin template

A minimal, copyable xNet plugin. `xnet plugin scaffold <id>` generates a project
just like this — this directory is here as a worked reference and to show the
GitHub Release workflow that publishes a plugin to the
[marketplace](https://xnet.fyi/plugins).

## Layout

```
manifest.json     # plugin metadata (id, contributions, capabilities)
src/index.ts      # defineExtension({ ... }) — your plugin
```

## Build & release

Bundle `src/index.ts` into a single `plugin.js` and attach it (with
`manifest.json`) to a GitHub Release. A workflow that does this on every version
tag:

```yaml
# .github/workflows/release.yml (in YOUR plugin repo)
name: Release plugin
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: npm ci && npm run build # produces dist/plugin.js
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/plugin.js
            manifest.json
```

## List it

Add one entry to [`registry/community.json`](../../registry/registry.json) in the
xNet repo and open a PR — see [`registry/README.md`](../../registry/README.md).
The app installs your plugin from your Release's `manifest.json`, in a sandbox
scoped to its trust tier, after showing the user the capabilities it requests.
