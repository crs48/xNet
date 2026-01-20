/**
 * Schema system for xNet.
 *
 * This module provides:
 * - Node: The universal container type
 * - defineSchema: Create schemas with TypeScript inference
 * - Property helpers: text, number, select, date, etc.
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
  DefinedSchema,
  ValidationResult,
  ValidationError,
  CreateNodeOptions,
  InferPropertyType,
  InferProperties,
  InferCreateProps,
  InferNode
} from './types'

// Property helpers
export {
  text,
  number,
  checkbox,
  select,
  date,
  type TextOptions,
  type NumberOptions,
  type CheckboxOptions,
  type SelectOptions,
  type SelectOption,
  type DateOptions
} from './properties'
