/**
 * CanvasPluginFallbackCard tests.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasPluginFallbackCard } from './CanvasPluginFallbackCard'
import { createCanvasMissingPluginFallback } from './canvasPluginFallbacks'

describe('CanvasPluginFallbackCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders missing-plugin fallback attributes and actions', () => {
    const fallback = createCanvasMissingPluginFallback({
      reason: 'plugin-not-installed',
      pluginId: 'crm.pipeline',
      pluginName: 'CRM Pipeline',
      contributionId: 'opportunity-card',
      contributionName: 'Opportunity card',
      sourceLabel: 'Opportunity ACME-42',
      sourceUrl: 'xnet://object/opportunity/acme-42'
    })

    render(<CanvasPluginFallbackCard fallback={fallback} themeMode="light" title="ACME renewal" />)

    const card = document.querySelector('[data-canvas-plugin-fallback="true"]')

    expect(card).toHaveAttribute('data-canvas-card-kind', 'plugin-fallback')
    expect(card).toHaveAttribute('data-canvas-missing-plugin-reason', 'plugin-not-installed')
    expect(card).toHaveAttribute('data-canvas-plugin-fallback-tone', 'warning')
    expect(card).toHaveAttribute('data-canvas-plugin-id', 'crm.pipeline')
    expect(card).toHaveAttribute('data-canvas-plugin-contribution-id', 'opportunity-card')
    expect(card).toHaveAttribute('data-canvas-plugin-preserves-source', 'true')
    expect(screen.getByText('ACME renewal')).toBeInTheDocument()
    expect(screen.getByText('CRM Pipeline')).toBeInTheDocument()
    expect(screen.getAllByText('Plugin required')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Install required plugin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open preserved source' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View preserved object JSON' })).toBeInTheDocument()
    expect(screen.getByText('Opportunity ACME-42')).toBeInTheDocument()
  })

  it('routes action callbacks and opens preserved source links', () => {
    const onAction = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const fallback = createCanvasMissingPluginFallback({
      reason: 'plugin-error',
      pluginName: 'Media Importer',
      contributionName: 'Video card',
      sourceUrl: 'https://example.com/video'
    })

    render(<CanvasPluginFallbackCard fallback={fallback} themeMode="dark" onAction={onAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry plugin renderer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open preserved source' }))

    expect(onAction).toHaveBeenCalledWith('retry-renderer', fallback)
    expect(onAction).toHaveBeenCalledWith('open-source', fallback)
    expect(open).toHaveBeenCalledWith('https://example.com/video', '_blank', 'noopener,noreferrer')
  })

  it('renders permission prompts for blocked plugin cards', () => {
    const fallback = createCanvasMissingPluginFallback({
      reason: 'permission-required',
      pluginName: 'ERP Planner',
      contributionName: 'Purchase order card',
      requiredPermissions: ['erp.purchase-orders:read', 'files:read']
    })

    render(<CanvasPluginFallbackCard fallback={fallback} themeMode="light" />)

    const permissionLabel = document.querySelector(
      '[data-canvas-plugin-fallback-permissions="true"]'
    )

    expect(document.querySelector('[data-canvas-plugin-fallback="true"]')).toHaveAttribute(
      'data-canvas-missing-plugin-reason',
      'permission-required'
    )
    expect(permissionLabel).toHaveTextContent('erp.purchase-orders:read, files:read')
    expect(screen.getByRole('button', { name: 'Request plugin permission' })).toBeInTheDocument()
  })

  it('renders plugin card audit trail entries when provided', () => {
    const fallback = createCanvasMissingPluginFallback({
      reason: 'plugin-disabled',
      pluginName: 'ERP Planner',
      contributionName: 'Purchase order card'
    })

    render(
      <CanvasPluginFallbackCard
        fallback={fallback}
        themeMode="light"
        auditEntries={[
          {
            id: 'audit-1',
            operation: 'plugin-render',
            occurredAt: '2026-05-02T12:30:00.000Z',
            summary: 'Renderer disabled by workspace policy',
            actorLabel: 'Workspace admin',
            source: 'plugin',
            pluginId: 'com.xnet.fixtures.erp',
            contributionId: 'erp.purchase-order-card'
          }
        ]}
      />
    )

    const trail = document.querySelector('[data-canvas-card-audit-trail="true"]')
    const entry = document.querySelector('[data-canvas-card-audit-entry="true"]')

    expect(trail).toHaveAttribute('data-canvas-card-audit-count', '1')
    expect(entry).toHaveAttribute('data-canvas-card-audit-operation', 'plugin-render')
    expect(screen.getByText('Renderer disabled by workspace policy')).toBeInTheDocument()
  })
})
