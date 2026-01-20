/**
 * @xnet/records - Schema Operations
 */

// Database operations
export { createDatabase, updateDatabase, cloneDatabase, validateDatabase } from './database'
export type { CreateDatabaseOptions, UpdateDatabaseOptions } from './database'

// Property operations
export {
  createProperty,
  updateProperty,
  deleteProperty,
  moveProperty,
  addSelectOption,
  updateSelectOption,
  deleteSelectOption
} from './property'
export type { CreatePropertyOptions, UpdatePropertyOptions } from './property'

// View operations
export {
  createView,
  updateView,
  deleteView,
  duplicateView,
  moveView,
  setDefaultView,
  togglePropertyInView,
  reorderPropertiesInView
} from './view'
export type { CreateViewOptions, UpdateViewOptions } from './view'
