/**
 * @xnet/database - Property Handlers
 *
 * Exports all property type handlers and registry functions.
 */

// Types
export type {
  PropertyHandler,
  PropertyEditorProps,
  PropertyDisplayProps,
  ValidationResult
} from './types'

// Registry
export {
  getPropertyHandler,
  hasPropertyHandler,
  getPropertyTypes,
  registerPropertyHandler,
  propertyCategories,
  getPropertyCategory,
  isComputedProperty,
  isMultiValueProperty
} from './registry'

// Individual property handlers
export { textProperty } from './text'
export { numberProperty } from './number'
export { checkboxProperty } from './checkbox'
export { dateProperty } from './date'
export { dateRangeProperty } from './date-range'
export { selectProperty, getSelectOptionColor } from './select'
export { multiSelectProperty, getMultiSelectOptionColors } from './multi-select'
export { personProperty, isValidDID } from './person'
export { relationProperty } from './relation'
export type { RelationConfig } from './relation'
export { rollupProperty, computeRollup } from './rollup'
export type { RollupValue } from './rollup'
export { formulaProperty, evaluateFormula } from './formula'
export type { FormulaValue, FormulaReturnType } from './formula'
export { urlProperty } from './url'
export { emailProperty, isValidEmail } from './email'
export { phoneProperty, normalizePhone } from './phone'
export { fileProperty, formatFileSize, getFileExtension, isImageType } from './file'
export { createdProperty, updatedProperty, createdByProperty } from './auto'
