/**
 * Metric widget - One big number from a QueryAST aggregate.
 *
 * The query declares an aggregate aliased 'value'; useSavedView executes it
 * over the loaded snapshot (executeQueryASTLoadedAggregates) and the renderer
 * just displays the result.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { nodeQuery, preferredSchema, stubDescriptor, TASK_SCHEMA_IRI } from './shared'

export interface MetricWidgetConfig extends Record<string, unknown> {
  label?: string
}

function MetricWidget({ config, data }: WidgetProps<MetricWidgetConfig>): JSX.Element {
  const aggregate = data.aggregates?.results.value
  const value = aggregate ? aggregate.value : data.rows.length
  const display =
    typeof value === 'number'
      ? Number.isInteger(value)
        ? value.toLocaleString()
        : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : '—'

  return (
    <div className="flex h-full flex-col items-start justify-center px-4">
      <div className="text-4xl font-semibold tabular-nums text-foreground">
        {data.loading ? '…' : display}
      </div>
      {config.label ? (
        <div className="mt-1 text-sm text-muted-foreground">{config.label}</div>
      ) : null}
    </div>
  )
}

export const metricWidget: WidgetDefinition<MetricWidgetConfig> = {
  type: 'metric.count',
  name: 'Metric',
  icon: 'hash',
  description: 'A single count or aggregate from any query',
  trustTier: 'first-party',
  defaultSize: { w: 3, h: 2, minW: 2, minH: 2 },
  configFields: [{ key: 'label', label: 'Label', type: 'text' }],
  getStubConfig: ({ schemas }) => {
    const schemaId = preferredSchema(schemas, [TASK_SCHEMA_IRI]) ?? TASK_SCHEMA_IRI
    return {
      config: { label: 'Total' },
      query: {
        descriptor: stubDescriptor(
          'Metric',
          nodeQuery(schemaId, { aggregates: [{ alias: 'value', function: 'count' }] })
        ),
        refresh: 'live'
      }
    }
  },
  component: MetricWidget
}
