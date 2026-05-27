/**
 * Canvas plugin fallback descriptor tests.
 */

import { describe, expect, it } from 'vitest'
import { createCanvasMissingPluginFallback } from './canvasPluginFallbacks'

describe('createCanvasMissingPluginFallback', () => {
  it('describes missing plugin cards as recoverable install fallbacks', () => {
    const fallback = createCanvasMissingPluginFallback({
      reason: 'plugin-not-installed',
      pluginId: 'crm.pipeline',
      pluginName: 'CRM Pipeline',
      contributionId: 'opportunity-card',
      contributionName: 'Opportunity card',
      sourceLabel: 'Opportunity ACME-42',
      sourceUrl: 'xnet://object/opportunity/acme-42'
    })

    expect(fallback).toMatchObject({
      reason: 'plugin-not-installed',
      label: 'Plugin required',
      tone: 'warning',
      pluginId: 'crm.pipeline',
      pluginName: 'CRM Pipeline',
      contributionId: 'opportunity-card',
      contributionName: 'Opportunity card',
      sourceLabel: 'Opportunity ACME-42',
      sourceUrl: 'xnet://object/opportunity/acme-42',
      preservesSource: true
    })
    expect(fallback.description).toContain('CRM Pipeline is needed')
    expect(fallback.actions.map((action) => action.kind)).toEqual([
      'install-plugin',
      'open-source',
      'view-json'
    ])
  })

  it('describes permission requirements with the requested permission scopes', () => {
    const fallback = createCanvasMissingPluginFallback({
      reason: 'permission-required',
      pluginName: 'ERP Planner',
      contributionName: 'Purchase order card',
      requiredPermissions: ['erp.purchase-orders:read', 'files:read']
    })

    expect(fallback).toMatchObject({
      reason: 'permission-required',
      label: 'Permission required',
      tone: 'warning',
      requiredPermissions: ['erp.purchase-orders:read', 'files:read']
    })
    expect(fallback.description).toContain('erp.purchase-orders:read and files:read')
    expect(fallback.actions.map((action) => action.kind)).toEqual([
      'request-permission',
      'view-json'
    ])
  })

  it('normalizes blank values and reports sandbox blocks as danger states', () => {
    const fallback = createCanvasMissingPluginFallback({
      reason: 'sandbox-blocked',
      pluginId: '   ',
      pluginName: '  ',
      contributionId: '  media-card ',
      sourceUrl: '   ',
      requiredPermissions: ['  network:embed ', ' ']
    })

    expect(fallback).toMatchObject({
      reason: 'sandbox-blocked',
      label: 'Sandbox blocked',
      tone: 'danger',
      pluginId: null,
      pluginName: null,
      contributionId: 'media-card',
      sourceUrl: null,
      requiredPermissions: ['network:embed']
    })
    expect(fallback.actions.map((action) => action.kind)).toEqual([
      'request-permission',
      'retry-renderer',
      'view-json'
    ])
  })
})
