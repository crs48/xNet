/**
 * Formula dependency tracking and circular detection.
 *
 * Extracts column dependencies from formulas and detects circular references.
 */

import type { ColumnDefinition, FormulaColumnConfig } from '../column-types'
import { FormulaParser, type ASTNode } from './parser'

// ─── Dependency Extraction ───────────────────────────────────────────────────

/**
 * Extract column dependencies from a formula expression.
 *
 * @example
 * ```typescript
 * const deps = extractDependencies('{{price}} * {{quantity}}')
 * // ['price', 'quantity']
 * ```
 */
export function extractDependencies(expression: string): string[] {
  const parser = new FormulaParser()

  try {
    const ast = parser.parse(expression)
    const deps = new Set<string>()
    collectDependencies(ast, deps)
    return Array.from(deps)
  } catch {
    // If parsing fails, return empty dependencies
    return []
  }
}

function collectDependencies(node: ASTNode, deps: Set<string>): void {
  switch (node.type) {
    case 'reference':
      deps.add(node.columnId)
      break

    case 'binary':
      collectDependencies(node.left, deps)
      collectDependencies(node.right, deps)
      break

    case 'unary':
      collectDependencies(node.operand, deps)
      break

    case 'call':
      node.args.forEach((arg) => collectDependencies(arg, deps))
      break

    case 'conditional':
      collectDependencies(node.condition, deps)
      collectDependencies(node.then, deps)
      collectDependencies(node.else, deps)
      break

    case 'literal':
      // No dependencies
      break
  }
}

// ─── Circular Detection ──────────────────────────────────────────────────────

export interface CircularCheckResult {
  hasCircular: boolean
  cycle?: string[]
}

/**
 * Check for circular dependencies between formula columns.
 *
 * @example
 * ```typescript
 * const result = detectCircularDependencies(columns)
 * if (result.hasCircular) {
 *   console.log('Circular dependency:', result.cycle)
 * }
 * ```
 */
export function detectCircularDependencies(columns: ColumnDefinition[]): CircularCheckResult {
  const formulas = columns.filter((c) => c.type === 'formula')

  // Build dependency graph
  const graph = new Map<string, string[]>()

  for (const formula of formulas) {
    const config = formula.config as FormulaColumnConfig
    const deps = extractDependencies(config.expression)
    graph.set(formula.id, deps)
  }

  // DFS to find cycles
  const visited = new Set<string>()
  const stack = new Set<string>()
  const path: string[] = []

  function dfs(nodeId: string): string[] | null {
    if (stack.has(nodeId)) {
      // Found cycle - extract the cycle from path
      const cycleStart = path.indexOf(nodeId)
      return [...path.slice(cycleStart), nodeId]
    }

    if (visited.has(nodeId)) {
      return null
    }

    visited.add(nodeId)
    stack.add(nodeId)
    path.push(nodeId)

    const deps = graph.get(nodeId) ?? []
    for (const dep of deps) {
      const cycle = dfs(dep)
      if (cycle) return cycle
    }

    stack.delete(nodeId)
    path.pop()
    return null
  }

  for (const formula of formulas) {
    visited.clear()
    stack.clear()
    path.length = 0

    const cycle = dfs(formula.id)
    if (cycle) {
      return { hasCircular: true, cycle }
    }
  }

  return { hasCircular: false }
}

/**
 * Check if adding a formula would create a circular dependency.
 *
 * @example
 * ```typescript
 * const wouldCycle = wouldCreateCircular('total', '{{subtotal}} + {{tax}}', columns)
 * ```
 */
export function wouldCreateCircular(
  columnId: string,
  expression: string,
  columns: ColumnDefinition[]
): boolean {
  // Create a temporary column with the new formula
  const tempColumn: ColumnDefinition = {
    id: columnId,
    name: 'Temp',
    type: 'formula',
    config: { expression, resultType: 'number' }
  }

  // Check with the temporary column included
  const allColumns = [...columns.filter((c) => c.id !== columnId), tempColumn]
  const result = detectCircularDependencies(allColumns)

  return result.hasCircular
}

// ─── Dependency Graph ────────────────────────────────────────────────────────

export interface DependencyGraph {
  /** columnId -> column IDs it depends on */
  columnDeps: Map<string, string[]>

  /** columnId -> column IDs that depend on it */
  reverseDeps: Map<string, string[]>
}

/**
 * Build a dependency graph for all columns.
 *
 * @example
 * ```typescript
 * const graph = buildDependencyGraph(columns)
 * const affectedColumns = graph.reverseDeps.get('price') // Columns that depend on price
 * ```
 */
export function buildDependencyGraph(columns: ColumnDefinition[]): DependencyGraph {
  const columnDeps = new Map<string, string[]>()
  const reverseDeps = new Map<string, string[]>()

  // Initialize reverse deps for all columns
  for (const col of columns) {
    reverseDeps.set(col.id, [])
  }

  for (const column of columns) {
    const deps = getColumnDependencies(column)
    columnDeps.set(column.id, deps)

    // Build reverse index
    for (const dep of deps) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, [])
      }
      reverseDeps.get(dep)!.push(column.id)
    }
  }

  return { columnDeps, reverseDeps }
}

function getColumnDependencies(column: ColumnDefinition): string[] {
  if (column.type === 'formula') {
    const config = column.config as FormulaColumnConfig
    return extractDependencies(config.expression)
  }

  // Rollup columns depend on their relation column
  if (column.type === 'rollup') {
    const config = column.config as { relationColumn: string }
    return [config.relationColumn]
  }

  return []
}

/**
 * Get all columns that need recomputing when a column changes.
 * Traverses the dependency graph to find all affected columns.
 *
 * @example
 * ```typescript
 * const affected = getAffectedColumns('price', graph)
 * // Returns all columns that depend on 'price' (directly or indirectly)
 * ```
 */
export function getAffectedColumns(changedColumnId: string, graph: DependencyGraph): string[] {
  const affected = new Set<string>()
  const queue = [changedColumnId]

  while (queue.length > 0) {
    const current = queue.shift()!
    const dependents = graph.reverseDeps.get(current) ?? []

    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.add(dep)
        queue.push(dep)
      }
    }
  }

  return Array.from(affected)
}

/**
 * Get the evaluation order for formula columns.
 * Returns columns in topological order (dependencies first).
 *
 * @example
 * ```typescript
 * const order = getEvaluationOrder(columns)
 * // Evaluate formulas in this order to ensure dependencies are computed first
 * ```
 */
export function getEvaluationOrder(columns: ColumnDefinition[]): ColumnDefinition[] {
  const formulas = columns.filter((c) => c.type === 'formula')
  const graph = buildDependencyGraph(columns)

  const result: ColumnDefinition[] = []
  const visited = new Set<string>()
  const temp = new Set<string>()

  function visit(columnId: string): void {
    if (temp.has(columnId)) {
      // Circular dependency - skip (should be caught by detectCircularDependencies)
      return
    }
    if (visited.has(columnId)) {
      return
    }

    temp.add(columnId)

    const deps = graph.columnDeps.get(columnId) ?? []
    for (const dep of deps) {
      visit(dep)
    }

    temp.delete(columnId)
    visited.add(columnId)

    const column = formulas.find((c) => c.id === columnId)
    if (column) {
      result.push(column)
    }
  }

  for (const formula of formulas) {
    visit(formula.id)
  }

  return result
}
