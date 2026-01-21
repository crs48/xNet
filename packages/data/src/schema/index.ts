/**
 * Schema system for xNet.
 *
 * This module provides:
 * - Node: The universal container type
 * - defineSchema: Create schemas with TypeScript inference
 * - Property helpers: text, number, select, date, etc.
 * - Built-in schemas: Page, Database, Task
 * - Schema registry: Runtime lookup for schemas
 */

// Node type
export type { Node, SchemaIRI, DID } from './node'
export { isNode, createNodeId } from './node'

// Schema definition
export { defineSchema, type DefineSchemaOptions } from './define'

// Types
export type {
  PropertyType,
  PropertyDefinition,
  PropertyBuilder,
  Schema,
  DocumentType,
  DefinedSchema,
  ValidationResult,
  ValidationError,
  CreateNodeOptions,
  InferPropertyType,
  InferProperties,
  InferCreateProps,
  InferNode
} from './types'

// Property helpers - Basic
export {
  text,
  number,
  checkbox,
  type TextOptions,
  type NumberOptions,
  type CheckboxOptions
} from './properties'

// Property helpers - Temporal
export {
  date,
  dateRange,
  type DateOptions,
  type DateRangeOptions,
  type DateRange
} from './properties'

// Property helpers - Selection
export {
  select,
  multiSelect,
  type SelectOptions,
  type SelectOption,
  type MultiSelectOptions
} from './properties'

// Property helpers - References
export { person, relation, type PersonOptions, type RelationOptions } from './properties'

// Property helpers - Rich
export {
  url,
  email,
  phone,
  file,
  type UrlOptions,
  type EmailOptions,
  type PhoneOptions,
  type FileOptions,
  type FileRef
} from './properties'

// Property helpers - Auto
export {
  created,
  updated,
  createdBy,
  type CreatedOptions,
  type UpdatedOptions,
  type CreatedByOptions
} from './properties'

// Built-in schemas
export { PageSchema, type Page } from './schemas'
export { DatabaseSchema, type Database } from './schemas'
export { TaskSchema, type Task } from './schemas'
export { builtInSchemas, type BuiltInSchemaIRI } from './schemas'

// Schema registry
export { SchemaRegistry, schemaRegistry } from './registry'
