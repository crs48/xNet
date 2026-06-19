# Extend xNet with registries

xNet exposes several **runtime registries** so you can add a chart type, a map
basemap, a canvas shape, a dashboard widget, or a view type **without changing
core code**. They all share one shape (a `Map<id, definition>` with `register()`
→ `Disposable`, `get`/`has`/`getAll`, and an `onChange` listener), so once you
know one you know them all.

This guide covers the registries added in exploration
[0205](../explorations/0205_[_]_DECOMPOSING_THE_APP_INTO_PLUGINS.md). For the
`WidgetRegistry` (dashboard) and `ViewRegistry` (views) — the originals this
pattern is modeled on — see those packages.

## The shared pattern

```ts
const disposable = someRegistry.register({
  /* definition */
})
// …later, to remove it:
disposable.dispose()
```

Built-ins register lazily and are import-order-safe: calling any resolver
(`resolve*`, `has*`, `*Types()`) guarantees the built-ins are present, and they
re-populate even after `clear()` — so they can never be permanently lost.

A typical plugin registers on `activate` and disposes on `deactivate`:

```ts
import { defineExtension } from '@xnetjs/plugins'

let disposers = []
export const MyPlugin = defineExtension({
  id: 'com.example.my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  platforms: ['web', 'electron'],
  activate() {
    disposers = [
      /* registry.register(...) */
    ]
  },
  deactivate() {
    disposers.forEach((d) => d.dispose())
    disposers = []
  }
})
```

See [`apps/web/src/plugins/charts-extra-plugin.ts`](../../apps/web/src/plugins/charts-extra-plugin.ts)
for a complete first-party example that ships in the bundle.

## Add a chart type

`@xnetjs/charts` → `chartTypeRegistry`. A definition turns shaped rows into a
(library-agnostic) option object. Built-ins: `bar`, `line`, `area`, `pie`.

```ts
import { chartTypeRegistry, buildPieOption, type ChartTypeDefinition } from '@xnetjs/charts'

const donut: ChartTypeDefinition = {
  kind: 'donut',
  name: 'Donut',
  buildOption: ({ shaped, spec, theme }) => {
    const option = buildPieOption(spec, theme, shaped)
    const series = (option.series as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      radius: ['55%', '78%']
    }))
    return { ...option, series }
  }
}
chartTypeRegistry.register(donut)
```

- `XChart` resolves the kind through the registry (`resolveChartOption`) and
  renders a **graceful fallback** ("Unsupported chart type: …") for an unknown
  kind instead of crashing.
- If your kind needs an echarts series type beyond bar/line/pie, register that
  echarts component too (XChart only `echarts.use`s bar/line/pie by default).

## Add a map basemap

`@xnetjs/maps` → `basemapRegistry`. Built-ins: `protomaps-light`,
`protomaps-dark`, `blank`.

```ts
import { basemapRegistry, type BasemapDefinition } from '@xnetjs/maps'

const satellite: BasemapDefinition = {
  id: 'satellite',
  label: 'Satellite',
  usesPmtiles: false,
  buildStyle: () => ({
    version: 8,
    sources: {
      /* … */
    },
    layers: [
      /* … */
    ]
  })
}
basemapRegistry.register(satellite)
```

- `MapCanvas` resolves the style through `resolveBasemapStyle` and falls back to
  the always-offline `blank` basemap for an unknown id.
- `usesPmtiles` controls whether the `pmtiles://` protocol is registered.
- The `LayerPanel` picker lists the registry, so your basemap appears
  automatically.

## Add a canvas shape

`@xnetjs/canvas` → `shapeRegistry`. A definition builds the SVG path string.
Built-ins: rectangle, ellipse, diamond, triangle, hexagon, star, arrow,
cylinder, cloud, rounded-rectangle.

```ts
import { shapeRegistry, type ShapeDefinition } from '@xnetjs/canvas'

const pentagon: ShapeDefinition = {
  type: 'pentagon',
  label: 'Pentagon',
  buildPath: (width, height) => `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z`
}
shapeRegistry.register(pentagon)
```

- `ShapeNodeComponent` and `ShapePicker` render via `resolveShapePath` /
  `shapeTypes()` (reactive to registration), falling back to a rectangle for an
  unknown kind.

## Editor extensions: the Yjs schema-skew rule

The editor (TipTap) is already an extension architecture, but there is **one
line you must not cross**:

- **Schema extensions** — any TipTap **Node or Mark** — define the _persisted_
  document shape. Under Yjs collaboration, every collaborator's editor must
  agree on this shape. If one client lacks a node/mark another client used,
  ProseMirror **silently drops** the content and the corruption syncs with no
  error. Schema extensions must be **statically bundled and identical for all
  collaborators** — never lazy-loaded behind a route split, never contributed by
  a plugin only some peers have.
- **Behavior extensions** — slash menus, drag handles, keymaps, decorations,
  toolbars, input rules that add no schema — are safe to lazy-load and safe to
  contribute from a plugin.

Use the classifier in `@xnetjs/editor`:

```ts
import { partitionExtensions, schemaSkewRisks } from '@xnetjs/editor'

const { schema, behavior } = partitionExtensions(myExtensions) // bundle schema, lazy-load behavior
const risks = schemaSkewRisks(pluginContributedExtensions) // [] === safe
```

The plugin registry already warns in development when a plugin's editor
contribution adds schema (see
[`packages/plugins/src/editor-schema-safety.ts`](../../packages/plugins/src/editor-schema-safety.ts)).

## Storage backends and other data adapters

The data layer is **not** a registry — it's port/adapter shaped, injected at
client construction. To swap where data lives, implement the relevant port and
pass it to `createXNetClient`:

- `NodeStorageAdapter` (`@xnetjs/data`) — node persistence (Memory, SQLite…)
- `SyncProvider` (`@xnetjs/sync`) — sync transport
- `EmbeddingModel` / `VectorIndex` (`@xnetjs/vectors`) — semantic search
- `PolicyEvaluator` / `RoleResolver` (`@xnetjs/core`) — authorization

This is the SQLite-VFS-style seam: a stable core with a narrow, swappable
adapter below it. Making the _engine_ itself a plugin is intentionally **not**
supported (see the SQLite4 discussion in exploration 0205).
