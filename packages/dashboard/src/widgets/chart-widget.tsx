/**
 * Chart widgets - bar, line, area, pie over any widget query, rendered by
 * @xnetjs/charts. Config is a property-picker spec (x, y, series, aggregate)
 * shaped client-side from the loaded rows.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import type { ChartAggregate, ChartKind } from '@xnetjs/charts'
import { XChart } from '@xnetjs/charts'
import { nodeQuery, preferredSchema, stubDescriptor, TASK_SCHEMA_IRI } from './shared'

export interface ChartWidgetConfig extends Record<string, unknown> {
  x?: string
  y?: string
  series?: string
  aggregate?: ChartAggregate
}

const AGGREGATE_OPTIONS: Array<{ label: string; value: ChartAggregate }> = [
  { label: 'Count', value: 'count' },
  { label: 'Sum', value: 'sum' },
  { label: 'Average', value: 'avg' },
  { label: 'Min', value: 'min' },
  { label: 'Max', value: 'max' }
]

function chartComponent(kind: ChartKind) {
  return function ChartWidget({ config, data, width, height }: WidgetProps<ChartWidgetConfig>) {
    if (!config.x) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Pick an X axis property to chart
        </div>
      )
    }

    if (!data.loading && data.rows.length === 0) {
      return <div className="px-4 py-3 text-sm text-muted-foreground">No data</div>
    }

    return (
      <XChart
        rows={data.rows}
        spec={{
          kind,
          x: config.x,
          y: config.y,
          series: config.series,
          aggregate: config.aggregate ?? 'count'
        }}
        width={width}
        height={height}
      />
    )
  }
}

function makeChartWidget(
  kind: ChartKind,
  name: string,
  icon: string
): WidgetDefinition<ChartWidgetConfig> {
  return {
    type: `chart.${kind}`,
    name,
    icon,
    description: `${name} over any query, grouped by a property`,
    trustTier: 'first-party',
    defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
    configFields: [
      { key: 'x', label: 'X axis', type: 'property-select', required: true },
      { key: 'y', label: 'Y value', type: 'property-select' },
      { key: 'series', label: 'Split series by', type: 'property-select' },
      {
        key: 'aggregate',
        label: 'Aggregate',
        type: 'select',
        options: AGGREGATE_OPTIONS,
        defaultValue: 'count'
      }
    ],
    getStubConfig: ({ schemas }) => {
      const schemaId = preferredSchema(schemas, [TASK_SCHEMA_IRI]) ?? TASK_SCHEMA_IRI
      return {
        config: { x: 'status', aggregate: 'count' },
        query: {
          descriptor: stubDescriptor(name, nodeQuery(schemaId, { first: 500 })),
          refresh: 'live'
        }
      }
    },
    component: chartComponent(kind)
  }
}

export const barChartWidget = makeChartWidget('bar', 'Bar chart', 'bar-chart-3')
export const lineChartWidget = makeChartWidget('line', 'Line chart', 'line-chart')
export const areaChartWidget = makeChartWidget('area', 'Area chart', 'area-chart')
export const pieChartWidget = makeChartWidget('pie', 'Pie chart', 'pie-chart')

export const chartWidgets = [barChartWidget, lineChartWidget, areaChartWidget, pieChartWidget]
