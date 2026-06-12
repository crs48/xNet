import { describe, expect, it } from 'vitest'
import { buildChartOption, shapeChartData, type ChartTheme } from './spec'

const THEME: ChartTheme = {
  palette: ['#111'],
  textColor: '#222',
  axisColor: '#333',
  splitLineColor: '#444',
  backgroundColor: '#fff'
}

const ROWS = [
  { status: 'todo', estimate: 2, team: 'a' },
  { status: 'todo', estimate: 4, team: 'b' },
  { status: 'done', estimate: 6, team: 'a' },
  { status: null, estimate: 1, team: 'a' }
]

describe('shapeChartData', () => {
  it('counts rows per category by default', () => {
    expect(shapeChartData(ROWS, { kind: 'bar', x: 'status' })).toEqual({
      categories: ['todo', 'done', '(none)'],
      series: [{ name: 'value', values: [2, 1, 1] }]
    })
  })

  it('aggregates a numeric field per category', () => {
    expect(
      shapeChartData(ROWS, { kind: 'bar', x: 'status', y: 'estimate', aggregate: 'sum' })
    ).toEqual({
      categories: ['todo', 'done', '(none)'],
      series: [{ name: 'value', values: [6, 6, 1] }]
    })

    expect(
      shapeChartData(ROWS, { kind: 'bar', x: 'status', y: 'estimate', aggregate: 'avg' }).series[0]
        ?.values
    ).toEqual([3, 6, 1])
  })

  it('splits into one series per distinct series value', () => {
    const shaped = shapeChartData(ROWS, {
      kind: 'line',
      x: 'status',
      y: 'estimate',
      series: 'team',
      aggregate: 'sum'
    })

    expect(shaped.series).toEqual([
      { name: 'a', values: [2, 6, 1] },
      { name: 'b', values: [4, null, null] }
    ])
  })

  it('caps categories at maxCategories', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ status: `s${index}` }))
    const shaped = shapeChartData(many, { kind: 'bar', x: 'status', maxCategories: 10 })

    expect(shaped.categories).toHaveLength(10)
  })
})

describe('buildChartOption', () => {
  it('builds cartesian options for bar/line/area', () => {
    const option = buildChartOption(ROWS, { kind: 'area', x: 'status' }, THEME) as {
      xAxis: { data: string[] }
      series: Array<{ type: string; areaStyle?: object }>
    }

    expect(option.xAxis.data).toEqual(['todo', 'done', '(none)'])
    expect(option.series[0]?.type).toBe('line')
    expect(option.series[0]?.areaStyle).toBeDefined()
  })

  it('builds pie options with one datum per category', () => {
    const option = buildChartOption(ROWS, { kind: 'pie', x: 'status' }, THEME) as {
      series: Array<{ type: string; data: Array<{ name: string; value: number }> }>
    }

    expect(option.series[0]?.type).toBe('pie')
    expect(option.series[0]?.data).toEqual([
      { name: 'todo', value: 2 },
      { name: 'done', value: 1 },
      { name: '(none)', value: 1 }
    ])
  })
})
