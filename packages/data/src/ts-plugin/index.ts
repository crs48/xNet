/**
 * TypeScript Language Service Plugin for xNet Schema Validation
 *
 * This plugin provides:
 * - Warnings when schema changes are breaking
 * - Suggestions for migration code
 * - Quick fixes for common issues
 *
 * Usage in tsconfig.json:
 * ```json
 * {
 *   "compilerOptions": {
 *     "plugins": [{ "name": "@xnet/data/ts-plugin" }]
 *   }
 * }
 * ```
 */

import type * as ts from 'typescript/lib/tsserverlibrary'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SchemaInfo {
  name: string
  version: string
  properties: Map<string, PropertyInfo>
  location: ts.Node
}

export interface PropertyInfo {
  name: string
  type: string
  required: boolean
}

export interface SchemaChange {
  type: 'add' | 'remove' | 'modify' | 'rename'
  property: string
  risk: 'safe' | 'caution' | 'breaking'
  description: string
  suggestedFix?: string
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const typescript = modules.typescript

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const logger = info.project.projectService.logger
    logger.info('[xnet-schema-plugin] Initializing...')

    const proxy = createLanguageServiceProxy(info.languageService)

    // Track schema definitions across files
    const schemaCache = new Map<string, SchemaInfo>()

    // Override getSemanticDiagnostics to add schema warnings
    proxy.getSemanticDiagnostics = (fileName: string): ts.Diagnostic[] => {
      const prior = info.languageService.getSemanticDiagnostics(fileName)
      const program = info.languageService.getProgram()
      if (!program) return prior

      const sourceFile = program.getSourceFile(fileName)
      if (!sourceFile) return prior

      const schemaDiagnostics = analyzeSchemaChanges(typescript, sourceFile, schemaCache, logger)

      return [...prior, ...schemaDiagnostics]
    }

    // Override getCodeFixesAtPosition to provide quick fixes
    proxy.getCodeFixesAtPosition = (
      fileName: string,
      start: number,
      end: number,
      errorCodes: readonly number[],
      formatOptions: ts.FormatCodeSettings,
      preferences: ts.UserPreferences
    ): readonly ts.CodeFixAction[] => {
      const prior = info.languageService.getCodeFixesAtPosition(
        fileName,
        start,
        end,
        errorCodes,
        formatOptions,
        preferences
      )

      // Add our custom fixes for schema-related errors
      const schemaFixes = getSchemaCodeFixes(
        typescript,
        info.languageService,
        fileName,
        start,
        end,
        errorCodes
      )

      return [...prior, ...schemaFixes]
    }

    logger.info('[xnet-schema-plugin] Ready')
    return proxy
  }

  return { create }
}

// ─── Language Service Proxy ──────────────────────────────────────────────────

function createLanguageServiceProxy(ls: ts.LanguageService): ts.LanguageService {
  const proxy: ts.LanguageService = Object.create(null)

  for (const k of Object.keys(ls) as Array<keyof ts.LanguageService>) {
    const x = ls[k]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(proxy as any)[k] = typeof x === 'function' ? x.bind(ls) : x
  }

  return proxy
}

// ─── Schema Analysis ─────────────────────────────────────────────────────────

function analyzeSchemaChanges(
  typescript: typeof ts,
  sourceFile: ts.SourceFile,
  schemaCache: Map<string, SchemaInfo>,
  _logger: ts.server.Logger
): ts.Diagnostic[] {
  const diagnostics: ts.Diagnostic[] = []

  // Find defineSchema calls
  typescript.forEachChild(sourceFile, function visit(node) {
    if (isDefineSchemaCall(typescript, node)) {
      const schemaInfo = extractSchemaInfo(typescript, node, sourceFile)
      if (schemaInfo) {
        const cached = schemaCache.get(schemaInfo.name)

        if (cached && cached.version !== schemaInfo.version) {
          // Version changed - check for breaking changes
          const changes = diffSchemaProperties(cached, schemaInfo)
          const breakingChanges = changes.filter((c) => c.risk === 'breaking')
          const cautionChanges = changes.filter((c) => c.risk === 'caution')

          for (const change of breakingChanges) {
            diagnostics.push({
              file: sourceFile,
              start: node.getStart(),
              length: node.getWidth(),
              messageText: `Breaking schema change: ${change.description}. ${change.suggestedFix || 'Consider adding a migration lens.'}`,
              category: typescript.DiagnosticCategory.Error,
              code: 90001, // Custom error code
              source: 'xnet-schema-plugin'
            })
          }

          for (const change of cautionChanges) {
            diagnostics.push({
              file: sourceFile,
              start: node.getStart(),
              length: node.getWidth(),
              messageText: `Schema change requires attention: ${change.description}`,
              category: typescript.DiagnosticCategory.Warning,
              code: 90002,
              source: 'xnet-schema-plugin'
            })
          }
        }

        // Update cache
        schemaCache.set(schemaInfo.name, schemaInfo)
      }
    }

    typescript.forEachChild(node, visit)
  })

  return diagnostics
}

function isDefineSchemaCall(typescript: typeof ts, node: ts.Node): node is ts.CallExpression {
  if (!typescript.isCallExpression(node)) return false

  const expr = node.expression
  if (typescript.isIdentifier(expr) && expr.text === 'defineSchema') {
    return true
  }
  if (
    typescript.isPropertyAccessExpression(expr) &&
    typescript.isIdentifier(expr.name) &&
    expr.name.text === 'defineSchema'
  ) {
    return true
  }

  return false
}

function extractSchemaInfo(
  typescript: typeof ts,
  node: ts.CallExpression,
  _sourceFile: ts.SourceFile
): SchemaInfo | null {
  const args = node.arguments
  if (args.length === 0) return null

  const configArg = args[0]
  if (!typescript.isObjectLiteralExpression(configArg)) return null

  let name = ''
  let version = '1.0.0'
  const properties = new Map<string, PropertyInfo>()

  for (const prop of configArg.properties) {
    if (!typescript.isPropertyAssignment(prop)) continue
    if (!typescript.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'name' && typescript.isStringLiteral(prop.initializer)) {
      name = prop.initializer.text
    }

    if (propName === 'version' && typescript.isStringLiteral(prop.initializer)) {
      version = prop.initializer.text
    }

    if (propName === 'properties' && typescript.isObjectLiteralExpression(prop.initializer)) {
      for (const propDef of prop.initializer.properties) {
        if (!typescript.isPropertyAssignment(propDef)) continue
        if (!typescript.isIdentifier(propDef.name)) continue

        const propertyName = propDef.name.text
        const propertyInfo = extractPropertyInfo(typescript, propDef.initializer)
        if (propertyInfo) {
          properties.set(propertyName, { ...propertyInfo, name: propertyName })
        }
      }
    }
  }

  if (!name) return null

  return { name, version, properties, location: node }
}

function extractPropertyInfo(
  typescript: typeof ts,
  node: ts.Expression
): Omit<PropertyInfo, 'name'> | null {
  if (!typescript.isObjectLiteralExpression(node)) return null

  let type = 'unknown'
  let required = false

  for (const prop of node.properties) {
    if (!typescript.isPropertyAssignment(prop)) continue
    if (!typescript.isIdentifier(prop.name)) continue

    if (prop.name.text === 'type' && typescript.isStringLiteral(prop.initializer)) {
      type = prop.initializer.text
    }

    if (prop.name.text === 'required') {
      required = prop.initializer.kind === typescript.SyntaxKind.TrueKeyword
    }
  }

  return { type, required }
}

function diffSchemaProperties(oldSchema: SchemaInfo, newSchema: SchemaInfo): SchemaChange[] {
  const changes: SchemaChange[] = []

  // Check for removed properties
  for (const [name] of oldSchema.properties) {
    if (!newSchema.properties.has(name)) {
      changes.push({
        type: 'remove',
        property: name,
        risk: 'caution',
        description: `Property "${name}" was removed`,
        suggestedFix: `Add lens: remove('${name}')`
      })
    }
  }

  // Check for added properties
  for (const [name, newProp] of newSchema.properties) {
    if (!oldSchema.properties.has(name)) {
      changes.push({
        type: 'add',
        property: name,
        risk: newProp.required ? 'caution' : 'safe',
        description: newProp.required
          ? `Required property "${name}" was added`
          : `Optional property "${name}" was added`,
        suggestedFix: newProp.required ? `Add lens: addDefault('${name}', defaultValue)` : undefined
      })
    }
  }

  // Check for modified properties
  for (const [name, oldProp] of oldSchema.properties) {
    const newProp = newSchema.properties.get(name)
    if (!newProp) continue

    if (oldProp.type !== newProp.type) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'breaking',
        description: `Property "${name}" changed type from "${oldProp.type}" to "${newProp.type}"`,
        suggestedFix: `Add lens: transform('${name}', forwardFn, backwardFn)`
      })
    }

    if (!oldProp.required && newProp.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'caution',
        description: `Property "${name}" became required`,
        suggestedFix: `Add lens: addDefault('${name}', defaultValue)`
      })
    }
  }

  return changes
}

// ─── Code Fixes ──────────────────────────────────────────────────────────────

function getSchemaCodeFixes(
  _typescript: typeof ts,
  _languageService: ts.LanguageService,
  _fileName: string,
  _start: number,
  _end: number,
  errorCodes: readonly number[]
): ts.CodeFixAction[] {
  const fixes: ts.CodeFixAction[] = []

  // Only handle our custom error codes
  if (!errorCodes.includes(90001) && !errorCodes.includes(90002)) {
    return fixes
  }

  // TODO: Implement quick fixes that insert lens code
  // This would analyze the error and generate appropriate lens code

  return fixes
}

// ─── Export ──────────────────────────────────────────────────────────────────

// TypeScript language service plugins traditionally use `export = init`
// but for ESM compatibility we use default export. The plugin loader
// handles both patterns via tsserver.
export default init

// Also export individual utilities for testing
export { diffSchemaProperties, extractSchemaInfo, isDefineSchemaCall }
