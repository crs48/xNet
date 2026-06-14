# @xnetjs/dashboard

Dashboard builder with pluggable widgets for xNet. See docs/explorations/0162.

A draggable [gridstack](https://gridstackjs.com/) grid of widgets driven by a typed widget contract. Built-in widgets (metrics, task lists, saved views, charts, social feed, …) live alongside plugin-contributed widgets and fully sandboxed user-authored widgets.

## Installation

```bash
pnpm add @xnetjs/dashboard
```

`react` is a peer dependency.

## Features

- **Widget contract** -- `WidgetDefinition` / `WidgetProps` / `WidgetData` and the `WidgetRegistry` that holds them
- **Variables & time ranges** -- `resolveVariables`, `resolveTimeRange`, `interpolateDescriptor` for dashboard-level filters
- **Layout** -- `resolveLayout`, `placeWidget`, `applyLayoutChanges` over a fixed column grid
- **Runtime** -- `DashboardRuntimeProvider` + `useWidgetData` for data fetching
- **Built-in widgets** -- metric, task list, saved view, page links, recent items, calendar, chart, pin board, social feed
- **Plugin bridge** -- `connectWidgetContributions` turns `@xnetjs/plugins` contributions into widgets, with permission summaries
- **Sandbox tiers** -- safe-node rendering, an [SES](https://github.com/endojs/endo) compartment (`renderUserWidget`), and an `IframeWidgetHost` for untrusted user widgets
- **Canvas host** -- embed widgets as cards on the canvas (`CanvasWidgetCard`)
- **Components** -- `DashboardSurface`, `DashboardGrid`, `WidgetPicker`, `WidgetConfigPanel`, `DashboardVariablesBar`, `WidgetTile`

## Usage

```tsx
import {
  DashboardSurface,
  DashboardRuntimeProvider,
  widgetRegistry,
  registerBuiltinWidgets
} from '@xnetjs/dashboard'

registerBuiltinWidgets(widgetRegistry)

function App() {
  return (
    <DashboardRuntimeProvider value={runtime}>
      <DashboardSurface dashboard={dashboard} />
    </DashboardRuntimeProvider>
  )
}
```

## Trust tiers

User-authored widgets run in one of three escalating sandboxes (see exploration 0162):

1. **Safe node** -- a restricted declarative node tree (`renderSafeNode`)
2. **Compartment** -- code evaluated in a locked-down SES realm (`renderUserWidget`)
3. **Iframe** -- fully isolated origin (`IframeWidgetHost`)

## Testing

```bash
pnpm --filter @xnetjs/dashboard test
```
