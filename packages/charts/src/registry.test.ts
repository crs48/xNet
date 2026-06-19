import { describe, expect, it } from 'vitest'
import {
  buildFallbackOption,
  chartTypeRegistry,
  ensureBuiltinChartTypes,
  hasChartType,
  resolveChartOption,
  type ChartTypeDefinition
} from './registry'
import { type ChartTheme } from './spec'

const THEME: ChartTheme = {
  palette: ['#111'],
  textColor: '#222',
  axisColor: '#333',
  splitLineColor: '#444',
  backgroundColor: '#fff'
}

const ROWS = [
  { status: 'todo', estimate: 2 },
  { status: 'done', estimate: 6 }
]

describe('chartTypeRegistry', () => {
  it('has the four built-in kinds populated', () => {
    ensureBuiltinChartTypes()
    expect(hasChartType('bar')).toBe(true)
    expect(hasChartType('line')).toBe(true)
    expect(hasChartType('area')).toBe(true)
    expect(hasChartType('pie')).toBe(true)
  })

  it('repopulates built-ins after a clear (no permanent loss)', () => {
    chartTypeRegistry.clear()
    expect(hasChartType('bar')).toBe(true)
  })

  it('dispatches built-in kinds to the same options as the fast path', () => {
    const option = resolveChartOption(ROWS, { kind: 'bar', x: 'status' }, THEME) as {
      xAxis: { data: string[] }
      series: Array<{ type: string }>
    }
    expect(option.xAxis.data).toEqual(['todo', 'done'])
    expect(option.series[0]?.type).toBe('bar')
  })

  it('lets a plugin register a new chart kind with no core change', () => {
    const gantt: ChartTypeDefinition = {
      kind: 'gantt',
      name: 'Gantt',
      buildOption: ({ shaped }) => ({ custom: true, categories: shaped.categories })
    }
    const disposable = chartTypeRegistry.register(gantt)
    try {
      expect(hasChartType('gantt')).toBe(true)
      const option = resolveChartOption(ROWS, { kind: 'gantt', x: 'status' }, THEME) as {
        custom: boolean
        categories: string[]
      }
      expect(option.custom).toBe(true)
      expect(option.categories).toEqual(['todo', 'done'])
    } finally {
      disposable.dispose()
    }
    expect(hasChartType('gantt')).toBe(false)
  })

  it('renders a graceful fallback for an unknown kind', () => {
    const option = resolveChartOption(ROWS, { kind: 'does-not-exist', x: 'status' }, THEME) as {
      title: { text: string }
      series?: unknown
    }
    expect(option.title.text).toContain('does-not-exist')
    expect(option.series).toBeUndefined()
  })

  it('buildFallbackOption is pure and centered', () => {
    const option = buildFallbackOption({
      shaped: { categories: [], series: [] },
      spec: { kind: 'mystery', x: 'status' },
      theme: THEME
    }) as { title: { left: string; text: string } }
    expect(option.title.left).toBe('center')
    expect(option.title.text).toContain('mystery')
  })
})
