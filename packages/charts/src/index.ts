/**
 * @xnetjs/charts - ECharts-backed charts behind an xNet-flavored spec API
 * (docs/explorations/0162 phase 2).
 */

export {
  buildChartOption,
  shapeChartData,
  type ChartAggregate,
  type ChartKind,
  type ChartSeriesData,
  type ChartSpec,
  type ChartTheme,
  type ShapedChartData
} from './spec'
export { readChartTheme } from './theme'
export { XChart, type XChartProps } from './XChart'
