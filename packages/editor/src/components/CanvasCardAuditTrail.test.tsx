/**
 * CanvasCardAuditTrail tests.
 */

import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  CanvasCardAuditTrail,
  createCanvasCardAuditSummary,
  formatCanvasCardAuditTimestamp,
  normalizeCanvasCardAuditEntries,
  type CanvasCardAuditEntry
} from './CanvasCardAuditTrail'

const auditEntries: CanvasCardAuditEntry[] = [
  {
    id: 'audit-older',
    operation: 'create',
    occurredAt: '2026-05-01T10:00:00.000Z',
    actorLabel: 'Mina',
    fields: ['supplier', 'status', 'supplier'],
    source: 'domain',
    pluginId: 'com.xnet.fixtures.erp',
    contributionId: 'erp.purchase-order-card'
  },
  {
    id: 'audit-newer',
    operation: 'permission-change',
    occurredAt: '2026-05-02T12:30:00.000Z',
    summary: 'Financial fields hidden',
    actorId: 'did:key:z6MkReviewer',
    fields: ['totalUsd', 'marginUsd', 'supplier'],
    source: 'plugin',
    pluginId: 'com.xnet.fixtures.erp',
    contributionId: 'erp.purchase-order-card',
    batchId: 'batch-1'
  }
]

describe('CanvasCardAuditTrail', () => {
  it('normalizes and summarizes audit entries for card surfaces', () => {
    expect(normalizeCanvasCardAuditEntries(auditEntries).map((entry) => entry.id)).toEqual([
      'audit-newer',
      'audit-older'
    ])
    expect(createCanvasCardAuditSummary(auditEntries)).toMatchObject({
      totalEntries: 2,
      operationCounts: {
        create: 1,
        'permission-change': 1
      },
      actorLabels: ['did:key:z6MkReviewer', 'Mina'],
      topFields: [
        { field: 'supplier', count: 2 },
        { field: 'marginUsd', count: 1 },
        { field: 'status', count: 1 },
        { field: 'totalUsd', count: 1 }
      ]
    })
    expect(formatCanvasCardAuditTimestamp('2026-05-02T12:30:00.000Z')).toBe('2026-05-02 12:30 UTC')
  })

  it('renders a compact plugin/domain audit trail', () => {
    render(<CanvasCardAuditTrail entries={auditEntries} themeMode="light" />)

    const trail = document.querySelector('[data-canvas-card-audit-trail="true"]')
    const entries = document.querySelectorAll('[data-canvas-card-audit-entry="true"]')

    expect(trail).toHaveAttribute('data-canvas-card-audit-count', '2')
    expect(trail).toHaveAttribute('data-canvas-card-audit-latest-operation', 'permission-change')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveAttribute('data-canvas-card-audit-entry-id', 'audit-newer')
    expect(entries[0]).toHaveAttribute('data-canvas-card-audit-operation', 'permission-change')
    expect(entries[0]).toHaveAttribute('data-canvas-card-audit-source', 'plugin')
    expect(entries[0]).toHaveAttribute('data-canvas-card-audit-plugin-id', 'com.xnet.fixtures.erp')
    expect(entries[0]).toHaveAttribute(
      'data-canvas-card-audit-contribution-id',
      'erp.purchase-order-card'
    )
    expect(entries[0]).toHaveAttribute('data-canvas-card-audit-batch-id', 'batch-1')
    expect(screen.getByText('Financial fields hidden')).toBeInTheDocument()
    expect(screen.getByText(/did:key:z6MkReviewer/)).toBeInTheDocument()
  })

  it('can render an empty audit state when requested', () => {
    render(<CanvasCardAuditTrail entries={[]} themeMode="dark" showWhenEmpty />)

    expect(document.querySelector('[data-canvas-card-audit-empty="true"]')).toHaveTextContent(
      'No audit activity yet.'
    )
  })
})
