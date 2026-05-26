/**
 * Permission-aware canvas card field tests.
 */

import { describe, expect, it } from 'vitest'
import {
  createCanvasCardFieldId,
  createCanvasPermissionedCardField,
  createCanvasPermissionedCardFields
} from './canvasPermissionedCardFields'

describe('permissioned canvas card fields', () => {
  it('creates stable field ids from display labels', () => {
    expect(createCanvasCardFieldId('Purchase Order #')).toBe('purchase-order')
    expect(createCanvasCardFieldId('   ')).toBe('field')
  })

  it('redacts fields by field id or label without exposing raw values', () => {
    expect(
      createCanvasPermissionedCardFields(
        [
          { fieldId: 'po.total', label: 'Total', value: '$25,000' },
          { label: 'Owner Email', value: 'owner@example.com' },
          { label: 'Status', value: 'Approved' }
        ],
        [
          {
            fieldId: 'po.total',
            reason: 'missing-permission',
            requiredPermission: 'erp.purchase-orders:financials:read'
          },
          {
            label: 'Owner Email',
            replacement: 'Hidden'
          }
        ]
      )
    ).toEqual([
      {
        fieldId: 'po.total',
        label: 'Total',
        value: '$25,000',
        restricted: true,
        displayValue: 'Restricted',
        restrictionReason: 'missing-permission',
        requiredPermission: 'erp.purchase-orders:financials:read'
      },
      {
        fieldId: 'owner-email',
        label: 'Owner Email',
        value: 'owner@example.com',
        restricted: true,
        displayValue: 'Hidden'
      },
      {
        fieldId: 'status',
        label: 'Status',
        value: 'Approved',
        restricted: false,
        displayValue: 'Approved'
      }
    ])
  })

  it('keeps unrestricted fields readable', () => {
    expect(
      createCanvasPermissionedCardField(
        { fieldId: 'status', label: 'Status', value: 'Ready' },
        null
      )
    ).toEqual({
      fieldId: 'status',
      label: 'Status',
      value: 'Ready',
      restricted: false,
      displayValue: 'Ready'
    })
  })
})
