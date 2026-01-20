/**
 * Property helpers for schema definitions.
 *
 * Each helper returns a PropertyBuilder that includes:
 * - definition: The property definition for storage/JSON-LD
 * - validate: Runtime validation function
 * - coerce: Value coercion function
 * - _type: TypeScript type marker for inference
 */

export { text, type TextOptions } from './text'
export { number, type NumberOptions } from './number'
export { checkbox, type CheckboxOptions } from './checkbox'
export { select, type SelectOptions, type SelectOption } from './select'
export { date, type DateOptions } from './date'

// TODO: Add remaining property helpers as needed:
// export { dateRange } from './date-range'
// export { multiSelect } from './multi-select'
// export { person } from './person'
// export { relation } from './relation'
// export { rollup } from './rollup'
// export { formula } from './formula'
// export { url } from './url'
// export { email } from './email'
// export { phone } from './phone'
// export { file } from './file'
// export { created } from './created'
// export { updated } from './updated'
// export { createdBy } from './created-by'
