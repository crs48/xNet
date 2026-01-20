/**
 * @xnet/records - Record schema, property types, and CRDT integration
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // IDs
  DatabaseId,
  PropertyId,
  ViewId,
  ItemId,
  // Database & Items
  Database,
  DatabaseItem,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
  PropertyConfig,
  // Values
  DateRange,
  FileValue,
  SelectOption,
  RollupFunction,
  // Views
  View,
  ViewType,
  ViewConfig,
  TableViewConfig,
  BoardViewConfig,
  GalleryViewConfig,
  TimelineViewConfig,
  CalendarViewConfig,
  ListViewConfig,
  // Filtering & Sorting
  FilterGroup,
  Filter,
  FilterOperator,
  Sort,
  SortDirection
} from './types'

// ============================================================================
// Property System
// ============================================================================

// Property handler types
export type {
  PropertyHandler,
  PropertyEditorProps,
  PropertyDisplayProps,
  ValidationResult
} from './properties/types'

// Property registry
export {
  getPropertyHandler,
  hasPropertyHandler,
  getPropertyTypes,
  registerPropertyHandler,
  propertyCategories,
  getPropertyCategory,
  isComputedProperty,
  isMultiValueProperty
} from './properties/registry'

// Individual property handlers (for direct access/testing)
export { textProperty } from './properties/text'
export { numberProperty } from './properties/number'
export { checkboxProperty } from './properties/checkbox'
export { dateProperty } from './properties/date'
export { dateRangeProperty } from './properties/date-range'
export { selectProperty, getSelectOptionColor } from './properties/select'
export { multiSelectProperty, getMultiSelectOptionColors } from './properties/multi-select'
export { personProperty, isValidDID } from './properties/person'
export { relationProperty } from './properties/relation'
export type { RelationConfig } from './properties/relation'
export { rollupProperty, computeRollup } from './properties/rollup'
export type { RollupValue } from './properties/rollup'
export { formulaProperty, evaluateFormula } from './properties/formula'
export type { FormulaValue, FormulaReturnType } from './properties/formula'
export { urlProperty } from './properties/url'
export { emailProperty, isValidEmail } from './properties/email'
export { phoneProperty, normalizePhone } from './properties/phone'
export { fileProperty, formatFileSize, getFileExtension, isImageType } from './properties/file'
export { createdProperty, updatedProperty, createdByProperty } from './properties/auto'

// ============================================================================
// Schema Operations
// ============================================================================

export { createDatabase, updateDatabase, cloneDatabase, validateDatabase } from './schema/database'
export type { CreateDatabaseOptions, UpdateDatabaseOptions } from './schema/database'

export {
  createProperty,
  updateProperty,
  deleteProperty,
  moveProperty,
  addSelectOption,
  updateSelectOption,
  deleteSelectOption
} from './schema/property'
export type { CreatePropertyOptions, UpdatePropertyOptions } from './schema/property'

export {
  createView,
  updateView,
  deleteView,
  duplicateView,
  moveView,
  setDefaultView,
  togglePropertyInView,
  reorderPropertiesInView
} from './schema/view'
export type { CreateViewOptions, UpdateViewOptions } from './schema/view'

// ============================================================================
// Item Operations
// ============================================================================

export {
  createItem,
  updateItem,
  validateItem,
  queryItems,
  getFormattedValue,
  groupItemsByProperty
} from './operations/items'
export type { CreateItemOptions, UpdateItemOptions, QueryItemsOptions } from './operations/items'

// ============================================================================
// Utilities
// ============================================================================

export {
  generateDatabaseId,
  generatePropertyId,
  generateViewId,
  generateItemId,
  generateOptionId
} from './utils'
