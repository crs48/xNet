/**
 * Formula service for computing formula column values.
 *
 * Provides caching, validation, and batch computation for formula columns.
 */

import type { CellValue } from './cell-types'
import type { ColumnDefinition, FormulaColumnConfig } from './column-types'
import { extractDependencies, detectCircularDependencies } from './formula/dependency'
import { evaluate } from './formula/evaluator'
import { FormulaParser, type ASTNode } from './formula/parser'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A row with cells for formula computation.
 */
export interface FormulaRow {
  id: string
  databaseId: string
  cells: Record<string, CellValue>
}

/**
 * Result of formula validation.
 */
export interface FormulaValidationResult {
  valid: boolean
  error?: string
  dependencies?: string[]
}

// ─── Formula Service ─────────────────────────────────────────────────────────

export class FormulaService {
  private parser = new FormulaParser()
  private astCache = new Map<string, ASTNode>()
  private valueCache = new Map<string, { value: unknown; hash: string }>()

  /**
   * Compute a formula value for a row.
   *
   * @example
   * ```typescript
   * const service = new FormulaService()
   * const value = service.compute(row, formulaColumn, columns)
   * ```
   */
  compute(row: FormulaRow, column: ColumnDefinition, columns: ColumnDefinition[]): unknown {
    if (column.type !== 'formula') {
      throw new Error(`Column ${column.id} is not a formula column`)
    }

    const config = column.config as FormulaColumnConfig

    // Check cache
    const cacheKey = `${row.id}:${column.id}`
    const deps = config.dependencies ?? extractDependencies(config.expression)
    const hash = this.computeHash(row, deps)
    const cached = this.valueCache.get(cacheKey)

    if (cached && cached.hash === hash) {
      return cached.value
    }

    // Parse expression (cached)
    let ast = this.astCache.get(config.expression)
    if (!ast) {
      ast = this.parser.parse(config.expression)
      this.astCache.set(config.expression, ast)
    }

    // Build evaluation context
    const context = {
      getValue: (columnId: string): unknown => {
        // Check if dependency is also a formula
        const depColumn = columns.find((c) => c.id === columnId)
        if (depColumn?.type === 'formula') {
          return this.compute(row, depColumn, columns)
        }
        return row.cells[columnId]
      },
      getColumn: (columnId: string) => columns.find((c) => c.id === columnId)
    }

    // Evaluate
    try {
      const value = evaluate(ast, context)
      const coerced = this.coerceResult(value, config.resultType)

      this.valueCache.set(cacheKey, { value: coerced, hash })
      return coerced
    } catch (error) {
      console.error(`Formula error in ${column.name}:`, error)
      return null
    }
  }

  /**
   * Batch compute formulas for multiple rows.
   */
  batchCompute(
    rows: FormulaRow[],
    column: ColumnDefinition,
    columns: ColumnDefinition[]
  ): Map<string, unknown> {
    const results = new Map<string, unknown>()

    for (const row of rows) {
      const value = this.compute(row, column, columns)
      results.set(row.id, value)
    }

    return results
  }

  /**
   * Validate a formula expression.
   *
   * @example
   * ```typescript
   * const result = service.validate('{{price}} * {{quantity}}', columns)
   * if (!result.valid) {
   *   console.error(result.error)
   * }
   * ```
   */
  validate(expression: string, columns: ColumnDefinition[]): FormulaValidationResult {
    try {
      // Parse
      this.parser.parse(expression)

      // Extract dependencies
      const deps = extractDependencies(expression)

      // Check that all referenced columns exist
      for (const dep of deps) {
        if (!columns.find((c) => c.id === dep)) {
          return { valid: false, error: `Unknown column: ${dep}` }
        }
      }

      // Check for circular dependencies
      const tempColumn: ColumnDefinition = {
        id: '__temp__',
        name: 'Temp',
        type: 'formula',
        config: { expression, resultType: 'number' }
      }
      const allColumns = [...columns, tempColumn]
      const circularCheck = detectCircularDependencies(allColumns)

      if (circularCheck.hasCircular && circularCheck.cycle?.includes('__temp__')) {
        return {
          valid: false,
          error: `Circular dependency detected: ${circularCheck.cycle.join(' -> ')}`
        }
      }

      return { valid: true, dependencies: deps }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Parse error'
      }
    }
  }

  /**
   * Invalidate cache for a row.
   */
  invalidate(rowId: string): void {
    for (const key of this.valueCache.keys()) {
      if (key.startsWith(rowId)) {
        this.valueCache.delete(key)
      }
    }
  }

  /**
   * Invalidate all cached values.
   */
  invalidateAll(): void {
    this.valueCache.clear()
  }

  /**
   * Clear AST cache (use when formula expressions change).
   */
  clearAstCache(): void {
    this.astCache.clear()
  }

  private computeHash(row: FormulaRow, dependencies: string[]): string {
    const values = dependencies.map((d) => row.cells[d])
    return JSON.stringify(values)
  }

  private coerceResult(value: unknown, resultType: string): unknown {
    switch (resultType) {
      case 'number':
        return Number(value) || 0
      case 'text':
        return String(value ?? '')
      case 'checkbox':
        return Boolean(value)
      case 'date':
        if (value instanceof Date) return value.toISOString()
        if (typeof value === 'string') return value
        return null
      default:
        return value
    }
  }
}

/**
 * Create a new FormulaService instance.
 */
export function createFormulaService(): FormulaService {
  return new FormulaService()
}
