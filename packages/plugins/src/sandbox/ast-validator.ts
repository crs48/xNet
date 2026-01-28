/**
 * AST Validator - Security checks for user scripts
 *
 * Parses JavaScript code and validates against forbidden patterns
 * to ensure scripts cannot escape the sandbox.
 */

import * as acorn from 'acorn'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  /** Whether the script passed validation */
  valid: boolean
  /** List of validation errors (empty if valid) */
  errors: string[]
}

// Use 'any' for AST nodes since acorn's types are complex
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ASTNode = any

// ─── Forbidden Patterns ──────────────────────────────────────────────────────

/**
 * Global variables that scripts are not allowed to access
 */
const FORBIDDEN_GLOBALS = new Set([
  // Browser globals
  'window',
  'document',
  'globalThis',
  'self',
  'parent',
  'top',
  'frames',

  // Network access
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Request',
  'Response',

  // Storage
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',

  // Code execution (dangerous)
  'eval',
  'Function',

  // Node.js globals
  'require',
  'module',
  'exports',
  'process',
  'Buffer',
  '__dirname',
  '__filename',

  // Timers (could be used for timing attacks or resource exhaustion)
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'requestIdleCallback',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'cancelAnimationFrame',
  'cancelIdleCallback',

  // Browser APIs
  'navigator',
  'location',
  'history',
  'screen',
  'alert',
  'confirm',
  'prompt',
  'open',
  'close',
  'print',

  // Web Workers
  'Worker',
  'SharedWorker',
  'ServiceWorker',

  // Other dangerous APIs
  'Proxy',
  'Reflect',
  'SharedArrayBuffer',
  'Atomics',
  'WebAssembly',
  'crypto',
  'performance'
])

/**
 * Property names that could be used to escape the sandbox
 */
const FORBIDDEN_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
])

// ─── AST Walker ──────────────────────────────────────────────────────────────

type ASTVisitors = Record<string, (node: ASTNode) => void>

/**
 * Walk an AST and call visitors for each node type
 */
function walkAST(node: ASTNode, visitors: ASTVisitors): void {
  if (!node || typeof node !== 'object') return

  // Call visitor for this node type
  const nodeType = node.type as string
  const visitor = visitors[nodeType]
  if (visitor) {
    visitor(node)
  }

  // Walk child nodes
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') {
      continue
    }

    const child = node[key]

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkAST(item, visitors)
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkAST(child, visitors)
    }
  }
}

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Validate a script's AST for forbidden patterns.
 *
 * Checks for:
 * - Forbidden global variable access
 * - Import/export statements
 * - Dynamic import()
 * - Async/await (scripts must be synchronous)
 * - new Function() constructor
 * - Forbidden property access (__proto__, constructor, etc.)
 * - with statements
 * - eval calls
 *
 * @param code - JavaScript code to validate
 * @returns Validation result with errors if any
 *
 * @example
 * ```typescript
 * const result = validateScriptAST('(node) => node.amount * 1.08')
 * if (!result.valid) {
 *   console.error('Invalid script:', result.errors)
 * }
 * ```
 */
export function validateScriptAST(code: string): ValidationResult {
  const errors: string[] = []

  // Track declared variables (these are allowed to be referenced)
  const declaredVars = new Set<string>()

  try {
    // Wrap code if it's not already wrapped (arrow function or function expression)
    const trimmed = code.trim()
    const wrappedCode =
      trimmed.startsWith('(') || trimmed.startsWith('function') ? trimmed : `(${trimmed})`

    // Parse with strict mode (catches more issues)
    const ast = acorn.parse(wrappedCode, {
      ecmaVersion: 2022,
      sourceType: 'script', // No import/export
      allowReturnOutsideFunction: true
    }) as ASTNode

    // First pass: collect declared variables
    walkAST(ast, {
      VariableDeclarator: (node: ASTNode) => {
        if (node.id?.type === 'Identifier') {
          declaredVars.add(node.id.name)
        }
      },
      FunctionDeclaration: (node: ASTNode) => {
        if (node.id?.name) {
          declaredVars.add(node.id.name)
        }
      },
      FunctionExpression: (node: ASTNode) => {
        if (node.id?.name) {
          declaredVars.add(node.id.name)
        }
      },
      ArrowFunctionExpression: (node: ASTNode) => {
        // Collect parameter names
        for (const param of node.params || []) {
          if (param.type === 'Identifier') {
            declaredVars.add(param.name)
          }
        }
      }
    })

    // Also add function parameters from the top-level function
    walkAST(ast, {
      FunctionDeclaration: (node: ASTNode) => {
        for (const param of node.params || []) {
          if (param.type === 'Identifier') {
            declaredVars.add(param.name)
          }
        }
      },
      FunctionExpression: (node: ASTNode) => {
        for (const param of node.params || []) {
          if (param.type === 'Identifier') {
            declaredVars.add(param.name)
          }
        }
      }
    })

    // First pass: collect declared variables
    walkAST(ast, {
      VariableDeclarator: (node) => {
        if (node.id.type === 'Identifier') {
          declaredVars.add(node.id.name)
        }
      },
      FunctionDeclaration: (node) => {
        if (node.id?.name) {
          declaredVars.add(node.id.name)
        }
      },
      FunctionExpression: (node) => {
        if (node.id?.name) {
          declaredVars.add(node.id.name)
        }
      },
      ArrowFunctionExpression: (node) => {
        // Collect parameter names
        for (const param of node.params) {
          if (param.type === 'Identifier') {
            declaredVars.add(param.name)
          }
        }
      }
    })

    // Also add function parameters from the top-level function
    walkAST(ast, {
      FunctionDeclaration: (node) => {
        for (const param of node.params) {
          if (param.type === 'Identifier') {
            declaredVars.add(param.name)
          }
        }
      },
      FunctionExpression: (node) => {
        for (const param of node.params) {
          if (param.type === 'Identifier') {
            declaredVars.add(param.name)
          }
        }
      }
    })

    // Second pass: validate
    walkAST(ast, {
      // Check for forbidden globals
      Identifier: (node: ASTNode) => {
        const name = node.name

        // Skip if it's a declared variable or parameter
        if (declaredVars.has(name)) return

        // Skip safe built-ins
        const safeBuiltins = new Set([
          'undefined',
          'null',
          'true',
          'false',
          'NaN',
          'Infinity',
          'Array',
          'Object',
          'String',
          'Number',
          'Boolean',
          'Date',
          'Math',
          'JSON',
          'Error',
          'TypeError',
          'RangeError',
          'Map',
          'Set',
          'WeakMap',
          'WeakSet',
          'Symbol',
          'BigInt',
          'Promise',
          'parseInt',
          'parseFloat',
          'isNaN',
          'isFinite',
          'encodeURI',
          'encodeURIComponent',
          'decodeURI',
          'decodeURIComponent'
        ])
        if (safeBuiltins.has(name)) return

        // Check forbidden globals
        if (FORBIDDEN_GLOBALS.has(name)) {
          errors.push(`Forbidden global access: '${name}' at position ${node.start}`)
        }
      },

      // No import statements
      ImportDeclaration: (node: ASTNode) => {
        errors.push(`Import statements are not allowed at position ${node.start}`)
      },

      // No export statements
      ExportNamedDeclaration: (node: ASTNode) => {
        errors.push(`Export statements are not allowed at position ${node.start}`)
      },

      ExportDefaultDeclaration: (node: ASTNode) => {
        errors.push(`Export statements are not allowed at position ${node.start}`)
      },

      ExportAllDeclaration: (node: ASTNode) => {
        errors.push(`Export statements are not allowed at position ${node.start}`)
      },

      // No dynamic import()
      ImportExpression: (node: ASTNode) => {
        errors.push(`Dynamic import() is not allowed at position ${node.start}`)
      },

      // No async/await (scripts must be synchronous for predictability)
      AwaitExpression: (node: ASTNode) => {
        errors.push(`Async/await is not allowed at position ${node.start}`)
      },

      // Check for async functions
      FunctionDeclaration: (node: ASTNode) => {
        if (node.async) {
          errors.push(`Async functions are not allowed at position ${node.start}`)
        }
      },

      FunctionExpression: (node: ASTNode) => {
        if (node.async) {
          errors.push(`Async functions are not allowed at position ${node.start}`)
        }
      },

      ArrowFunctionExpression: (node: ASTNode) => {
        if (node.async) {
          errors.push(`Async arrow functions are not allowed at position ${node.start}`)
        }
      },

      // No new Function()
      NewExpression: (node: ASTNode) => {
        if (node.callee?.type === 'Identifier' && node.callee.name === 'Function') {
          errors.push(`new Function() is not allowed at position ${node.start}`)
        }
      },

      // Check for forbidden property access
      MemberExpression: (node: ASTNode) => {
        // Check computed access like obj['__proto__']
        if (node.computed && node.property?.type === 'Literal') {
          const propName = String(node.property.value)
          if (FORBIDDEN_PROPERTIES.has(propName)) {
            errors.push(`Access to '${propName}' is forbidden at position ${node.property.start}`)
          }
        }

        // Check direct property access like obj.__proto__
        if (!node.computed && node.property?.type === 'Identifier') {
          if (FORBIDDEN_PROPERTIES.has(node.property.name)) {
            errors.push(
              `Access to '${node.property.name}' is forbidden at position ${node.property.start}`
            )
          }
        }
      },

      // No with statements
      WithStatement: (node: ASTNode) => {
        errors.push(`'with' statements are not allowed at position ${node.start}`)
      },

      // Check for eval() calls
      CallExpression: (node: ASTNode) => {
        if (node.callee?.type === 'Identifier' && node.callee.name === 'eval') {
          errors.push(`eval() is not allowed at position ${node.start}`)
        }
      }
    })
  } catch (err) {
    // Parse error
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`Syntax error: ${message}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Quick check if code is likely safe (doesn't do full AST parse).
 * Use this for fast rejection before full validation.
 */
export function quickSafetyCheck(code: string): boolean {
  const lowerCode = code.toLowerCase()

  // Quick checks for obviously dangerous patterns
  const dangerousPatterns = [
    'import ',
    'require(',
    'eval(',
    '__proto__',
    'constructor(',
    'function(',
    'fetch(',
    'xmlhttprequest',
    'websocket',
    'localstorage',
    'sessionstorage',
    'indexeddb',
    'document.',
    'window.',
    'globalthis',
    'process.',
    'child_process'
  ]

  for (const pattern of dangerousPatterns) {
    if (lowerCode.includes(pattern)) {
      return false
    }
  }

  return true
}
