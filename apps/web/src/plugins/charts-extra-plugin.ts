/**
 * Extra Charts Plugin (exploration 0205) — a first-party dogfood of the
 * chart-type registry.
 *
 * Demonstrates that new chart kinds can be added by a plugin with NO change to
 * core charts code: it registers `donut` and `hbar` (horizontal bar) into the
 * `chartTypeRegistry` on activation. Both reuse echarts components already
 * loaded by XChart (pie/bar), so they render without enlarging the bundle.
 */

import type { Disposable, XNetExtension } from '@xnetjs/plugins'
import { buildPieOption, chartTypeRegistry, type ChartTypeDefinition } from '@xnetjs/charts'

const DONUT: ChartTypeDefinition = {
  kind: 'donut',
  name: 'Donut',
  icon: 'PieChart',
  buildOption: ({ spec, theme, shaped }) => {
    const option = buildPieOption(spec, theme, shaped)
    const series = (option.series as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      radius: ['55%', '78%']
    }))
    return { ...option, series }
  }
}

const HBAR: ChartTypeDefinition = {
  kind: 'hbar',
  name: 'Horizontal bar',
  icon: 'BarChartHorizontal',
  buildOption: ({ theme, shaped }) => ({
    color: theme.palette,
    backgroundColor: 'transparent',
    textStyle: { color: theme.textColor },
    tooltip: { trigger: 'axis' },
    legend:
      shaped.series.length > 1 ? { bottom: 0, textStyle: { color: theme.textColor } } : undefined,
    grid: {
      left: 8,
      right: 8,
      top: 24,
      bottom: shaped.series.length > 1 ? 32 : 8,
      containLabel: true
    },
    // Axes swapped vs a vertical bar: categories on Y, values on X.
    yAxis: {
      type: 'category',
      data: shaped.categories,
      axisLine: { lineStyle: { color: theme.axisColor } },
      axisLabel: { color: theme.textColor }
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: theme.axisColor } },
      axisLabel: { color: theme.textColor },
      splitLine: { lineStyle: { color: theme.splitLineColor } }
    },
    series: shaped.series.map((entry) => ({
      name: entry.name,
      type: 'bar',
      emphasis: { focus: 'series' },
      data: entry.values
    }))
  })
}

let disposers: Disposable[] = []

export const ChartsExtraPlugin: XNetExtension = {
  id: 'fyi.xnet.charts-extra',
  name: 'Extra Charts',
  version: '1.0.0',
  description: 'Adds donut and horizontal-bar chart types via the chart-type registry.',
  author: 'xNet',
  platforms: ['electron', 'web'],

  activate() {
    disposers = [chartTypeRegistry.register(DONUT), chartTypeRegistry.register(HBAR)]
  },

  deactivate() {
    for (const d of disposers) d.dispose()
    disposers = []
  }
}
