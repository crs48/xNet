# @xnetjs/abuse

## 3.0.0

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

- Updated dependencies [[`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6), [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe), [`215d61d`](https://github.com/crs48/xNet/commit/215d61d586048c7d7d2221947bdcde7966172907), [`33f4b9e`](https://github.com/crs48/xNet/commit/33f4b9ef38c72b2e898f7a4a4de83cc08b0aea88)]:
  - @xnetjs/crypto@3.0.0
  - @xnetjs/identity@3.0.0

## 2.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.5.0
  - @xnetjs/crypto@2.5.0

## 2.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.4.0
  - @xnetjs/crypto@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [[`3ea44c6`](https://github.com/crs48/xNet/commit/3ea44c6354e3f55443d3c3b49d8ca1f9c0941987)]:
  - @xnetjs/identity@2.3.0
  - @xnetjs/crypto@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.2.0
  - @xnetjs/crypto@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [[`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708)]:
  - @xnetjs/identity@2.1.0
  - @xnetjs/crypto@2.1.0

## 2.0.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.0.0
  - @xnetjs/crypto@2.0.0

## 1.0.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@1.0.0
  - @xnetjs/identity@1.0.0

## 0.12.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.12.0
  - @xnetjs/identity@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.11.1
  - @xnetjs/crypto@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.11.0
  - @xnetjs/crypto@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.10.0
  - @xnetjs/crypto@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.9.0
  - @xnetjs/crypto@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.8.0
  - @xnetjs/crypto@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.7.0
  - @xnetjs/crypto@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.6.0
  - @xnetjs/crypto@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.5.0
  - @xnetjs/crypto@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.4.0
  - @xnetjs/crypto@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.3.0
  - @xnetjs/identity@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.2.0
  - @xnetjs/crypto@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.1.2
  - @xnetjs/crypto@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.1.1
  - @xnetjs/crypto@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [[`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/identity@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.0.3
  - @xnetjs/crypto@0.0.3
