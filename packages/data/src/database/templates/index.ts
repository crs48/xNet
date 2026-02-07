/**
 * Templates module for database templates.
 *
 * Provides template types, built-in templates, and utilities for
 * creating and instantiating database templates.
 */

// Types
export type {
  DatabaseTemplate,
  TemplateCategory,
  TemplateColumn,
  TemplateView,
  TemplateSampleRow,
  TemplateMetadata,
  InstantiateOptions,
  InstantiatedDatabase,
  InstantiatedColumn,
  InstantiatedView,
  InstantiatedRow,
  SaveTemplateOptions,
  DatabaseForTemplate
} from './types'

// Built-in templates
export {
  BUILTIN_TEMPLATES,
  getTemplatesByCategory,
  searchTemplates,
  getTemplateById,
  getTemplateCategoryCounts
} from './builtin'

// Template instantiation
export { instantiateTemplate, createEmptyTemplate, createEmptyDatabase } from './instantiate'

// Save as template
export {
  createTemplateFromDatabase,
  sanitizeValueForTemplate,
  validateTemplate
} from './save-template'
