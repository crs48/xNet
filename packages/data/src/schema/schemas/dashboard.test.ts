import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { DashboardSchema } from './dashboard'

describe('DashboardSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('has the expected schema identity', () => {
    expect(DashboardSchema.schema['@id']).toBe('xnet://xnet.fyi/Dashboard@1.0.0')
    expect(DashboardSchema.schema.name).toBe('Dashboard')
    expect(DashboardSchema.schema.version).toBe('1.0.0')
  })

  it('defines title, icon, variables, widgets, and layouts properties', () => {
    const propIds = DashboardSchema.schema.properties.map((prop) => prop['@id'])

    expect(propIds).toContain('xnet://xnet.fyi/Dashboard@1.0.0#title')
    expect(propIds).toContain('xnet://xnet.fyi/Dashboard@1.0.0#icon')
    expect(propIds).toContain('xnet://xnet.fyi/Dashboard@1.0.0#variables')
    expect(propIds).toContain('xnet://xnet.fyi/Dashboard@1.0.0#widgets')
    expect(propIds).toContain('xnet://xnet.fyi/Dashboard@1.0.0#layouts')
  })

  it('creates a dashboard with widgets and per-breakpoint layouts', () => {
    const dashboard = DashboardSchema.create(
      {
        title: 'Main',
        icon: '📊',
        variables: { timeRange: { kind: 'preset', preset: '7d' } },
        widgets: [
          {
            id: 'w1',
            widgetType: 'metric.count',
            config: { label: 'Open tasks' },
            refresh: 'live'
          }
        ],
        layouts: {
          lg: [{ id: 'w1', x: 0, y: 0, w: 3, h: 2 }],
          xs: [{ id: 'w1', x: 0, y: 0, w: 1, h: 2 }]
        }
      },
      { createdBy: testDID }
    )

    expect(dashboard.title).toBe('Main')
    expect(dashboard.widgets).toHaveLength(1)
    expect(dashboard.widgets?.[0]?.widgetType).toBe('metric.count')
    expect(dashboard.layouts?.lg?.[0]).toEqual({ id: 'w1', x: 0, y: 0, w: 3, h: 2 })
    expect(dashboard.variables?.timeRange).toEqual({ kind: 'preset', preset: '7d' })
  })
})
