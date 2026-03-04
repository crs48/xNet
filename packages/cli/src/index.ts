/**
 * @xnetjs/cli - xNet CLI tools
 *
 * This package provides CLI tools for schema migrations, diagnostics,
 * and development utilities.
 */

// Export schema diff utilities for programmatic use
export {
  diffSchemas,
  type SchemaChange,
  type SchemaChangeType,
  type RiskLevel
} from './utils/schema-diff.js'

// Export lens generator for programmatic use
export { generateLensCode, type GenerateLensOptions } from './utils/lens-generator.js'
