/**
 * Property helpers for schema definitions.
 *
 * Each helper returns a PropertyBuilder that includes:
 * - definition: The property definition for storage/JSON-LD
 * - validate: Runtime validation function
 * - coerce: Value coercion function
 * - _type: TypeScript type marker for inference
 *
 * Property types (18 total):
 * - Basic: text, number, checkbox
 * - Temporal: date, dateRange
 * - Selection: select, multiSelect
 * - References: person, relation
 * - Rich: url, email, phone, file
 * - Auto: created, updated, createdBy
 * - Computed: rollup, formula (not yet implemented)
 */

// Basic types
export { text, type TextOptions } from './text'
export { number, type NumberOptions } from './number'
export { checkbox, type CheckboxOptions } from './checkbox'

// Temporal types
export { date, type DateOptions } from './date'
export { dateRange, type DateRangeOptions, type DateRange } from './dateRange'

// Selection types
export { select, type SelectOptions, type SelectOption } from './select'
export { multiSelect, type MultiSelectOptions } from './multiSelect'

// Reference types
export { person, type PersonOptions } from './person'
export { relation, type RelationOptions } from './relation'

// Rich types
export { url, type UrlOptions } from './url'
export { email, type EmailOptions } from './email'
export { phone, type PhoneOptions } from './phone'
export { file, type FileOptions, type FileRef } from './file'

// Auto-populated types
export { created, type CreatedOptions } from './created'
export { updated, type UpdatedOptions } from './updated'
export { createdBy, type CreatedByOptions } from './createdBy'

// TODO: Computed types (not yet implemented)
// export { rollup } from './rollup'
// export { formula } from './formula'
