/**
 * @xnet/database - Property Registry
 *
 * Central registry for all property type handlers.
 */

import type { PropertyType } from '../types'
import type { PropertyHandler } from './types'

import { textProperty } from './text'
import { numberProperty } from './number'
import { checkboxProperty } from './checkbox'
import { dateProperty } from './date'
import { dateRangeProperty } from './date-range'
import { selectProperty } from './select'
import { multiSelectProperty } from './multi-select'
import { personProperty } from './person'
import { relationProperty } from './relation'
import { rollupProperty } from './rollup'
import { formulaProperty } from './formula'
import { urlProperty } from './url'
import { emailProperty } from './email'
import { phoneProperty } from './phone'
import { fileProperty } from './file'
import { createdProperty, updatedProperty, createdByProperty } from './auto'

/**
 * Map of property type to handler
 */
const propertyRegistry = new Map<PropertyType, PropertyHandler>([
  ['text', textProperty],
  ['number', numberProperty],
  ['checkbox', checkboxProperty],
  ['date', dateProperty],
  ['dateRange', dateRangeProperty],
  ['select', selectProperty],
  ['multiSelect', multiSelectProperty],
  ['person', personProperty],
  ['relation', relationProperty],
  ['rollup', rollupProperty],
  ['formula', formulaProperty],
  ['url', urlProperty],
  ['email', emailProperty],
  ['phone', phoneProperty],
  ['file', fileProperty],
  ['created', createdProperty],
  ['updated', updatedProperty],
  ['createdBy', createdByProperty]
])

/**
 * Get handler for a property type
 */
export function getPropertyHandler(type: PropertyType): PropertyHandler {
  const handler = propertyRegistry.get(type)
  if (!handler) {
    throw new Error(`Unknown property type: ${type}`)
  }
  return handler
}

/**
 * Check if a property type exists
 */
export function hasPropertyHandler(type: string): type is PropertyType {
  return propertyRegistry.has(type as PropertyType)
}

/**
 * Get all registered property types
 */
export function getPropertyTypes(): PropertyType[] {
  return Array.from(propertyRegistry.keys())
}

/**
 * Register a custom property handler
 */
export function registerPropertyHandler(type: PropertyType, handler: PropertyHandler): void {
  propertyRegistry.set(type, handler)
}

/**
 * Property type categories for UI grouping
 */
export const propertyCategories = {
  basic: ['text', 'number', 'checkbox'] as PropertyType[],
  temporal: ['date', 'dateRange'] as PropertyType[],
  selection: ['select', 'multiSelect'] as PropertyType[],
  reference: ['person', 'relation', 'rollup'] as PropertyType[],
  computed: ['formula'] as PropertyType[],
  rich: ['url', 'email', 'phone', 'file'] as PropertyType[],
  auto: ['created', 'updated', 'createdBy'] as PropertyType[]
}

/**
 * Get category for a property type
 */
export function getPropertyCategory(type: PropertyType): keyof typeof propertyCategories | null {
  for (const [category, types] of Object.entries(propertyCategories)) {
    if (types.includes(type)) {
      return category as keyof typeof propertyCategories
    }
  }
  return null
}

/**
 * Check if property type is computed (not editable)
 */
export function isComputedProperty(type: PropertyType): boolean {
  return (
    type === 'formula' ||
    type === 'rollup' ||
    type === 'created' ||
    type === 'updated' ||
    type === 'createdBy'
  )
}

/**
 * Check if property type supports multiple values
 */
export function isMultiValueProperty(type: PropertyType): boolean {
  return type === 'multiSelect' || type === 'person' || type === 'relation' || type === 'file'
}
