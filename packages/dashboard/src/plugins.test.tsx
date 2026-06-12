import type { WidgetContribution } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { summarizePluginPermissions, widgetDefinitionFromContribution } from './plugins'

describe('summarizePluginPermissions', () => {
  it('summarizes schema permissions with names and wildcards', () => {
    expect(
      summarizePluginPermissions({
        schemas: {
          read: ['xnet://xnet.fyi/Task@1.0.0', 'xnet://xnet.fyi/Page@1.0.0'],
          write: '*',
          create: ['xnet://xnet.fyi/Comment@1.0.0']
        }
      })
    ).toEqual(['Read: Task, Page', 'Modify all your data', 'Create: Comment'])

    expect(summarizePluginPermissions({ schemas: { read: '*' } })).toEqual(['Read all your data'])
  })

  it('summarizes capability permissions', () => {
    expect(
      summarizePluginPermissions({
        capabilities: {
          network: ['api.example.com'],
          clipboard: true,
          notifications: true,
          processes: true
        }
      })
    ).toEqual([
      'Access the network: api.example.com',
      'Read and write the clipboard',
      'Show notifications',
      'Run system processes'
    ])

    expect(summarizePluginPermissions({ capabilities: { network: true } })).toEqual([
      'Access the network'
    ])
  })

  it('returns no lines for empty permissions', () => {
    expect(summarizePluginPermissions({})).toEqual([])
  })
})

describe('widgetDefinitionFromContribution', () => {
  const contribution: WidgetContribution = {
    type: 'com.example.widget',
    name: 'Example',
    defaultSize: { w: 3, h: 2 },
    getStubConfig: () => ({ config: { a: 1 } }),
    component: () => <div />
  }

  it('applies host defaults and the host-assigned trust tier', () => {
    const definition = widgetDefinitionFromContribution(contribution, 'marketplace')

    expect(definition.trustTier).toBe('marketplace')
    expect(definition.icon).toBe('blocks')
    expect(definition.configFields).toEqual([])
    expect(definition.permissions).toBeUndefined()
    expect(definition.getStubConfig({ schemas: [] })).toEqual({ config: { a: 1 } })
  })

  it('passes through stub queries and permission lines', () => {
    const withQuery: WidgetContribution = {
      ...contribution,
      icon: 'rss',
      configFields: [{ key: 'x', label: 'X', type: 'text' }],
      getStubConfig: () => ({ config: {}, query: { descriptor: { version: 1 } } })
    }
    const definition = widgetDefinitionFromContribution(withQuery, 'user', ['Access the network'])

    expect(definition.icon).toBe('rss')
    expect(definition.permissions).toEqual(['Access the network'])
    expect(definition.configFields).toHaveLength(1)
    expect(definition.getStubConfig({ schemas: [] }).query).toEqual({
      descriptor: { version: 1 }
    })
  })
})
