/**
 * ChartTypeRegistry - Runtime registry of chart kinds (exploration 0205).
 *
 * Mirrors the dashboard `WidgetRegistry` / views `ViewRegistry` pattern so the
 * previously-hardcoded `ChartKind` union becomes a real extension seam: a
 * plugin can register a new kind (gantt, scatter, waterfall…) with no change to
 * core charts code. Built-in kinds (bar/line/area/pie) register lazily so the
 * registry is always populated when consulted, independent of import order.
 */

import type { ChartSpec, ChartTheme, ShapedChartData } from './spec'
import { buildCartesianOption, buildPieOption, shapeChartData } from './spec'

export interface Disposable {
  dispose(): void
}

/** Everything a chart-type builder needs to produce an option object. */
export interface ChartBuildContext {
  /** Rows grouped/aggregated per {@link ChartSpec}. */
  shaped: ShapedChartData
  spec: ChartSpec
  theme: ChartTheme
}

export interface ChartTypeDefinition {
  /** Stable identifier used as `ChartSpec.kind` (e.g. 'bar', 'gantt'). */
  kind: string
  /** Human-readable name for pickers. */
  name: string
  /** Optional Lucide icon name for pickers. */
  icon?: string
  /** Build the full (library-agnostic) option object for this kind. */
  buildOption(ctx: ChartBuildContext): Record<string, unknown>
}

export class ChartTypeRegistry {
  private types = new Map<string, ChartTypeDefinition>()
  private listeners = new Set<() => void>()

  register(def: ChartTypeDefinition): Disposable {
    if (this.types.has(def.kind)) {
      console.warn(`[ChartTypeRegistry] Overriding existing chart kind '${def.kind}'`)
    }
    this.types.set(def.kind, def)
    this.notify()
    return {
      dispose: () => {
        this.types.delete(def.kind)
        this.notify()
      }
    }
  }

  get(kind: string): ChartTypeDefinition | undefined {
    return this.types.get(kind)
  }

  getAll(): ChartTypeDefinition[] {
    return [...this.types.values()]
  }

  has(kind: string): boolean {
    return this.types.has(kind)
  }

  get size(): number {
    return this.types.size
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.types.clear()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[ChartTypeRegistry] Listener error:', err)
      }
    }
  }
}

/** Global chart-type registry instance. */
export const chartTypeRegistry = new ChartTypeRegistry()

/** The four core chart kinds, expressed as registry definitions. */
export const BUILTIN_CHART_TYPES: ChartTypeDefinition[] = [
  { kind: 'bar', name: 'Bar', icon: 'BarChart3', buildOption: builtinCartesian },
  { kind: 'line', name: 'Line', icon: 'LineChart', buildOption: builtinCartesian },
  { kind: 'area', name: 'Area', icon: 'AreaChart', buildOption: builtinCartesian },
  {
    kind: 'pie',
    name: 'Pie',
    icon: 'PieChart',
    buildOption: ({ spec, theme, shaped }) => buildPieOption(spec, theme, shaped)
  }
]

function builtinCartesian({ spec, theme, shaped }: ChartBuildContext): Record<string, unknown> {
  return buildCartesianOption(spec, theme, shaped)
}

let builtinsRegistered = false

/**
 * Register the built-in chart kinds (idempotent, import-order-safe). Cheaply
 * short-circuits once registered, but re-populates if the registry was cleared
 * (e.g. in tests), so built-ins can never be permanently lost.
 */
export function ensureBuiltinChartTypes(): void {
  if (builtinsRegistered && chartTypeRegistry.has('bar')) return
  builtinsRegistered = true
  for (const def of BUILTIN_CHART_TYPES) {
    if (!chartTypeRegistry.has(def.kind)) chartTypeRegistry.register(def)
  }
}

/** True if a chart kind (built-in or plugin-contributed) is renderable. */
export function hasChartType(kind: string): boolean {
  ensureBuiltinChartTypes()
  return chartTypeRegistry.has(kind)
}

/**
 * Graceful fallback for an unknown chart kind: an option with a centered
 * notice and no series, so an unregistered kind shows a message instead of
 * crashing the host (validation: "unknown types render a graceful fallback").
 */
export function buildFallbackOption(ctx: ChartBuildContext): Record<string, unknown> {
  return {
    backgroundColor: 'transparent',
    title: {
      left: 'center',
      top: 'middle',
      text: `Unsupported chart type: ${ctx.spec.kind}`,
      textStyle: { color: ctx.theme.textColor, fontSize: 12, fontWeight: 'normal' as const }
    }
  }
}

/**
 * Registry-aware option builder. Dispatches `spec.kind` through the registry
 * (so plugin kinds work) and falls back to a notice option for unknown kinds.
 */
export function resolveChartOption(
  rows: ReadonlyArray<Record<string, unknown>>,
  spec: ChartSpec,
  theme: ChartTheme
): Record<string, unknown> {
  ensureBuiltinChartTypes()
  const shaped = shapeChartData(rows, spec)
  const def = chartTypeRegistry.get(spec.kind)
  const ctx: ChartBuildContext = { shaped, spec, theme }
  return def ? def.buildOption(ctx) : buildFallbackOption(ctx)
}
