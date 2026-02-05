/**
 * AI Prompt Builder for Script Generation
 *
 * Creates structured prompts that guide AI models to generate
 * valid, sandboxed scripts for xNet.
 */

import type { ScriptOutputType, ScriptTriggerType } from '../schemas/script'
import type { FlatNode } from '../sandbox/context'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Schema property definition (simplified for prompt building)
 */
export interface SchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
}

/**
 * Schema definition for prompt context
 */
export interface SchemaDefinition {
  name: string
  schemaIRI: string
  properties: SchemaProperty[]
}

/**
 * Request for AI script generation
 */
export interface AIScriptRequest {
  /** Natural language description of what the script should do */
  intent: string
  /** Schema definition with available fields */
  schema: SchemaDefinition
  /** Expected output type */
  outputType: ScriptOutputType
  /** Suggested trigger type */
  triggerType?: ScriptTriggerType
  /** Sample data nodes for context */
  examples?: FlatNode[]
  /** Additional constraints or requirements */
  constraints?: string[]
}

// ─── Prompt Templates ────────────────────────────────────────────────────────

const SYSTEM_CONTEXT = `You are generating a JavaScript script for xNet, a collaborative data platform.
The script is a pure function that receives a node (data record) and a context object.
It must return a value, a mutation object, or null.

CRITICAL CONSTRAINTS:
- NO imports, require, or dynamic import
- NO fetch, XMLHttpRequest, or network access
- NO DOM access (window, document, globalThis)
- NO async/await, setTimeout, setInterval
- NO eval, Function constructor, or __proto__ access
- Pure synchronous function only
- Must use arrow function syntax: (node, ctx) => ...`

const API_DOCUMENTATION = `
## Available API

The function signature is: (node, ctx) => result

### node (read-only)
The current data record. Access properties directly: node.propertyName

### ctx object (ScriptContext)

**Query:**
- ctx.nodes(schemaIRI?) - Query nodes, optionally filtered by schema. Returns frozen array.

**Time:**
- ctx.now() - Current timestamp in milliseconds

**Format Helpers (ctx.format):**
- ctx.format.date(timestamp, options?) - Format timestamp as date string
- ctx.format.number(value, options?) - Format number with locale
- ctx.format.currency(value, currency?, locale?) - Format as currency (default: USD)
- ctx.format.relative(timestamp) - Relative time ("2h ago", "3d ago")
- ctx.format.bytes(bytes) - Format bytes ("1.5 KB", "2.3 MB")

**Math Helpers (ctx.math):**
- ctx.math.sum(numbers[]) - Sum of array
- ctx.math.avg(numbers[]) - Average of array
- ctx.math.min(numbers[]) - Minimum value
- ctx.math.max(numbers[]) - Maximum value
- ctx.math.round(value, decimals?) - Round to decimal places
- ctx.math.clamp(value, min, max) - Clamp between min and max
- ctx.math.abs(value) - Absolute value
- ctx.math.floor(value) - Floor
- ctx.math.ceil(value) - Ceiling

**Text Helpers (ctx.text):**
- ctx.text.slugify(str) - Convert to URL-safe slug
- ctx.text.truncate(str, maxLength) - Truncate with ellipsis
- ctx.text.capitalize(str) - Capitalize first letter
- ctx.text.titleCase(str) - Title Case Each Word
- ctx.text.contains(str, search) - Case-insensitive contains
- ctx.text.template(template, vars) - Simple {var} replacement
- ctx.text.trim(str) - Trim whitespace
- ctx.text.lower(str) - Lowercase
- ctx.text.upper(str) - Uppercase

**Array Helpers (ctx.array):**
- ctx.array.first(items) - Get first element
- ctx.array.last(items) - Get last element
- ctx.array.sortBy(items, key, desc?) - Sort by property
- ctx.array.groupBy(items, key) - Group by property
- ctx.array.unique(items) - Remove duplicates
- ctx.array.count(items) - Count items
- ctx.array.compact(items) - Remove null/undefined
`

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Format schema properties for the prompt
 */
function formatSchemaProperties(properties: SchemaProperty[]): string {
  if (properties.length === 0) {
    return '(No properties defined)'
  }

  return properties
    .map((prop) => {
      let line = `- node.${prop.name}: ${prop.type}`
      if (prop.required) line += ' (required)'
      if (prop.description) line += ` - ${prop.description}`
      return line
    })
    .join('\n')
}

/**
 * Get description for output type
 */
function getOutputTypeDescription(type: ScriptOutputType): string {
  switch (type) {
    case 'value':
      return `Return a computed value (string, number, boolean, or object).
Used as a virtual/computed column in table views.
Example: (node) => node.quantity * node.unitPrice`

    case 'mutation':
      return `Return an object with property updates to merge into the node.
The returned object's properties will be applied to the node.
Example: (node) => node.amount > 1000 ? { priority: 'high' } : null`

    case 'decoration':
      return `Return an object with visual decorations (not persisted to node data).
Use for tags, badges, or highlights based on conditions.
Example: (node) => node.dueDate < ctx.now() ? { _decoration: 'OVERDUE' } : null`

    case 'void':
      return `Return null. Script runs for side effects only (logging, etc).
Example: (node) => { console.log(node.id); return null }`
  }
}

/**
 * Get description for trigger type
 */
function getTriggerTypeDescription(type: ScriptTriggerType): string {
  switch (type) {
    case 'manual':
      return 'Run manually via UI button'
    case 'onChange':
      return 'Run automatically when the node is created or updated'
    case 'onView':
      return 'Run when computing the value for display (lazy evaluation)'
    case 'scheduled':
      return 'Run on a schedule (cron)'
  }
}

/**
 * Format example nodes for the prompt
 */
function formatExamples(examples: FlatNode[]): string {
  if (examples.length === 0) return ''

  // Take first 3 examples, simplified
  const simplified = examples.slice(0, 3).map((node) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, schemaIRI, ...rest } = node
    return rest
  })

  return `
## Sample Data
Here are example nodes to understand the data structure:
\`\`\`json
${JSON.stringify(simplified, null, 2)}
\`\`\``
}

// ─── Main Prompt Builder ─────────────────────────────────────────────────────

/**
 * Build a complete prompt for AI script generation.
 *
 * @param request - The script generation request
 * @returns Complete prompt string for the AI model
 *
 * @example
 * ```typescript
 * const prompt = buildScriptPrompt({
 *   intent: 'Calculate total with 8% tax',
 *   schema: {
 *     name: 'Invoice',
 *     schemaIRI: 'xnet://myapp/Invoice',
 *     properties: [
 *       { name: 'subtotal', type: 'number', required: true },
 *       { name: 'taxRate', type: 'number' }
 *     ]
 *   },
 *   outputType: 'value'
 * })
 * ```
 */
export function buildScriptPrompt(request: AIScriptRequest): string {
  const {
    intent,
    schema,
    outputType,
    triggerType = 'onChange',
    examples = [],
    constraints = []
  } = request

  const sections: string[] = []

  // System context
  sections.push(SYSTEM_CONTEXT)

  // API documentation
  sections.push(API_DOCUMENTATION)

  // Schema context
  sections.push(`
## Schema: ${schema.name}
Schema IRI: ${schema.schemaIRI}

Available properties:
${formatSchemaProperties(schema.properties)}`)

  // Output type
  sections.push(`
## Output Type: ${outputType}
${getOutputTypeDescription(outputType)}`)

  // Trigger type context
  sections.push(`
## Trigger: ${triggerType}
${getTriggerTypeDescription(triggerType)}`)

  // Sample data
  if (examples.length > 0) {
    sections.push(formatExamples(examples))
  }

  // Additional constraints
  if (constraints.length > 0) {
    sections.push(`
## Additional Requirements
${constraints.map((c) => `- ${c}`).join('\n')}`)
  }

  // User request
  sections.push(`
## User Request
"${intent}"

Generate ONLY the arrow function expression. No markdown code fences, no explanation.
The function should handle edge cases (null values, missing properties) gracefully.

Format: (node, ctx) => { ... } or (node, ctx) => expression`)

  return sections.join('\n')
}

/**
 * Build a retry prompt when the first attempt fails validation.
 *
 * @param originalPrompt - The original prompt
 * @param errors - Validation errors from the first attempt
 * @returns Updated prompt with error feedback
 */
export function buildRetryPrompt(originalPrompt: string, errors: string[]): string {
  return `${originalPrompt}

---
IMPORTANT: Your previous attempt had validation errors:
${errors.map((e) => `- ${e}`).join('\n')}

Please fix these issues and generate a corrected version.
Remember: NO forbidden globals, NO async/await, NO imports.`
}
