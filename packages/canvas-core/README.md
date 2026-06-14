# @xnetjs/canvas-core

Canvas v3 tile, camera, LOD, and provider contracts for xNet.

The pure, framework-agnostic core of the infinite canvas: world/tile coordinate math, camera projection, level-of-detail selection, viewport interest planning, and the provider contract the renderer consumes. No React, no DOM — just the geometry and data contracts.

## Features

- **Coordinates & tiles** -- world ↔ local/screen point math, tile addressing, and tile coverage for rects and points
- **Camera** -- `createCanvasCamera`, screen↔world projection, visible-tile coverage
- **Level of detail** -- `chooseObjectLod` with configurable `LodBudgets`
- **Interest planning** -- `createViewportTileSubscriptionPlan`: which tiles to subscribe/prefetch for a viewport
- **Minimap summaries** -- build and roll up per-tile summaries for the minimap
- **Collaboration** -- tile-room ids and awareness fan-out plans for presence
- **Cross-tile moves & connectors** -- reconcile object moves across tile boundaries; connector storage + far-field edge summaries
- **Workers** -- transferable object payloads and a tile-summary worker request/response protocol
- **Synthetic scenes & benchmarks** -- generate synthetic worlds and profile worker transfer overhead

## Usage

```typescript
import {
  createCanvasCamera,
  getCameraVisibleTileCoverage,
  createViewportTileSubscriptionPlan
} from '@xnetjs/canvas-core'

const camera = createCanvasCamera({
  center: { x: 0, y: 0 },
  zoom: 1,
  viewport: { width: 1280, height: 720 }
})
const coverage = getCameraVisibleTileCoverage(camera)
const plan = createViewportTileSubscriptionPlan({ coverage })
```

## Modules

| Module             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `coordinates.ts`   | World/local point math, normalization                |
| `tiles.ts`         | Tile ids, bounds, coverage                           |
| `camera.ts`        | Camera state, screen↔world projection                |
| `lod.ts`           | Level-of-detail selection                            |
| `interest.ts`      | Viewport tile subscription/prefetch planning         |
| `summary.ts`       | Per-tile + minimap summaries                         |
| `collaboration.ts` | Tile rooms + awareness fan-out                       |
| `moves.ts`         | Cross-tile object move reconciliation                |
| `connectors.ts`    | Connector storage + far-field edge summaries         |
| `provider.ts`      | `CanvasSceneProvider` contract + scene types         |
| `workers.ts`       | Transferable payloads + tile-summary worker protocol |
| `wasm-density.ts`  | Density-grid binning (optional WASM backend)         |
| `synthetic.ts`     | Synthetic scene generation                           |
| `benchmarks.ts`    | Worker-transfer + synthetic-world benchmarks         |

## Testing

```bash
pnpm --filter @xnetjs/canvas-core test
```
