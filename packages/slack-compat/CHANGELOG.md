# @xnetjs/slack-compat

## 0.0.3

### Patch Changes

- [#571](https://github.com/crs48/xNet/pull/571) [`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6) Thanks [@crs48](https://github.com/crs48)! - Document alpha status in every package README. xNet is released — these packages
  are on npm and usable today — but it is early software: APIs can change between
  releases, sometimes without a migration path. Each README now says so up front,
  so the notice is visible on the npm package page. Docs only; no code changes.

- [#587](https://github.com/crs48/xNet/pull/587) [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe) Thanks [@crs48](https://github.com/crs48)! - Fix TypeScript type resolution for every package's export map, and ship
  `@xnetjs/data/portability`.

  `types` was ordered after `import` in 48 export subpaths across 19 packages.
  Export conditions are order-sensitive, so TypeScript could resolve the wrong
  entry — or no types at all — depending on the consumer's `moduleResolution`.
  `types` is now first everywhere.

  `@xnetjs/data` also advertised a `./portability` subpath that was never added to
  its build, so `@xnetjs/data/portability` — the `.xnetpack` export/import codec —
  did not resolve at all for consumers. It now builds and ships.

  Both were found by adding `publint` to CI.

- [#565](https://github.com/crs48/xNet/pull/565) [`649cdf7`](https://github.com/crs48/xNet/commit/649cdf74eaf62aa2c08186857b3cd695efa5e3f6) Thanks [@crs48](https://github.com/crs48)! - Spell the brand `xNet` consistently in user-visible copy

  The repo had drifted between `xNet` and `XNet` in prose. Everything a
  consumer can read now uses the lowercase-x, uppercase-N form.
  - `@xnetjs/plugins`: the managed AI provider's display name is now
    `'xNet Cloud'` (was `'XNet Cloud'`), along with its connector label and
    setup hints. Cosmetic — the managed tier is selected by its `'managed'`
    id, not by this string, and nothing persists it.
  - `@xnetjs/cli`: `xnet bridge` help text and its pairing instructions.
  - `@xnetjs/slack-compat`: published package description.

  No exported names, signatures, or wire contracts changed. Code identifiers
  (`XNetProvider`, `useXNet`, `XNetKit`) keep their existing casing.

## 0.0.2

### Patch Changes

- [#262](https://github.com/crs48/xNet/pull/262) [`6183829`](https://github.com/crs48/xNet/commit/618382920002a39f00e4f5f4a2ae604c2aef4fa6) Thanks [@crs48](https://github.com/crs48)! - First public release. These MIT packages are runtime or public-API dependencies
  of already-published packages (`@xnetjs/plugins` → `trust` + `slack-compat`,
  `@xnetjs/react` → `billing`, `@xnetjs/cli` → `devkit`), so publishing them closes
  the dependency graph and lets those packages install cleanly from npm.
