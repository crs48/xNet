/**
 * XChart - React wrapper around ECharts with selective imports
 * (echarts/core + canvas renderer + bar/line/pie only, ~100 KB gzipped).
 *
 * Renders a text fallback when no 2d canvas context is available (jsdom,
 * SSR) so hosts can mount charts unconditionally.
 */

import type { ChartSpec } from './spec'
import type { ECharts } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef } from 'react'
import { buildChartOption } from './spec'
import { readChartTheme } from './theme'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  CanvasRenderer
])

function canvasAvailable(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return document.createElement('canvas').getContext('2d') !== null
  } catch {
    return false
  }
}

export interface XChartProps {
  rows: ReadonlyArray<Record<string, unknown>>
  spec: ChartSpec
  /** Pixel size of the chart area; the chart resizes to match */
  width: number
  height: number
  className?: string
}

export function XChart({ rows, spec, width, height, className }: XChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const supported = useMemo(canvasAvailable, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !supported) return

    const chart = echarts.init(container)
    chartRef.current = chart
    return () => {
      chart.dispose()
      chartRef.current = null
    }
  }, [supported])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(buildChartOption(rows, spec, readChartTheme(containerRef.current)), {
      notMerge: true
    })
  }, [rows, spec])

  useEffect(() => {
    if (width > 0 && height > 0) {
      chartRef.current?.resize({ width, height })
    }
  }, [width, height])

  if (!supported) {
    return (
      <div
        ref={containerRef}
        className={className}
        data-chart-fallback="true"
        style={{ width: '100%', height: '100%' }}
      >
        Chart ({spec.kind}) unavailable: no canvas support
      </div>
    )
  }

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
