# @xnetjs/charts

ECharts-backed charts behind an xNet-flavored spec API. See docs/explorations/0162 (phase 2).

A thin layer over [Apache ECharts](https://echarts.apache.org/): describe a chart with a declarative `ChartSpec`, and `XChart` renders it on the workspace theme. The spec/data shaping is pure and React-free; only `XChart` needs React.

## Installation

```bash
pnpm add @xnetjs/charts
```

`react` is a peer dependency.

## Features

- **Declarative spec** -- `ChartSpec` describes the chart kind, series, and aggregation; `buildChartOption` turns it into an ECharts option and `shapeChartData` shapes raw rows into series data
- **Theming** -- `readChartTheme` reads the workspace `ChartTheme` from CSS variables so charts match the surrounding UI
- **React component** -- `XChart` renders a spec + data with the resolved theme

## Usage

```tsx
import { XChart, type ChartSpec } from '@xnetjs/charts'

const spec: ChartSpec = {
  kind: 'bar',
  series: [{ field: 'count', aggregate: 'sum' }]
  // ...
}

function Panel({ rows }) {
  return <XChart spec={spec} data={rows} />
}
```

## Modules

| Module       | Description                                        |
| ------------ | -------------------------------------------------- |
| `spec.ts`    | `ChartSpec` → ECharts option + data shaping (pure) |
| `theme.ts`   | Read the chart theme from workspace CSS variables  |
| `XChart.tsx` | React chart component                              |

## Testing

```bash
pnpm --filter @xnetjs/charts test
```
