/**
 * @xnetjs/charts - ECharts-backed charts behind an xNet-flavored spec API
 * (docs/explorations/0162 phase 2).
 */

export {
  buildBaseOption,
  buildCartesianOption,
  buildChartOption,
  buildPieOption,
  shapeChartData,
  type ChartAggregate,
  type ChartKind,
  type ChartSeriesData,
  type ChartSpec,
  type ChartTheme,
  type ShapedChartData
} from './spec'
export {
  BUILTIN_CHART_TYPES,
  ChartTypeRegistry,
  buildFallbackOption,
  chartTypeRegistry,
  ensureBuiltinChartTypes,
  hasChartType,
  resolveChartOption,
  type ChartBuildContext,
  type ChartTypeDefinition,
  type Disposable
} from './registry'
export { readChartTheme } from './theme'
export { XChart, type XChartProps } from './XChart'

import { ensureBuiltinChartTypes } from './registry'

// Populate the registry with built-in kinds as soon as the package is imported
// so `chartTypeRegistry.getAll()` is complete for pickers without a render.
ensureBuiltinChartTypes()
