/**
 * Tests for the Script Sandbox system
 */

import type { FlatNode } from '../sandbox'
import { describe, it, expect } from 'vitest'
import {
  validateScriptAST,
  quickSafetyCheck,
  ScriptSandbox,
  ScriptValidationError,
  createScriptContext
} from '../sandbox'

describe('validateScriptAST', () => {
  describe('valid scripts', () => {
    it('accepts simple arrow function', () => {
      const result = validateScriptAST('(node) => node.amount * 1.08')
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts arrow function with block body', () => {
      const result = validateScriptAST(`(node) => {
        const tax = node.amount * 0.08
        return node.amount + tax
      }`)
      expect(result.valid).toBe(true)
    })

    it('accepts function with context parameter', () => {
      const result = validateScriptAST(`(node, ctx) => {
        const items = ctx.nodes('xnet://app/Item')
        return ctx.math.sum(items.map(i => i.price))
      }`)
      expect(result.valid).toBe(true)
    })

    it('accepts use of safe built-ins', () => {
      const result = validateScriptAST(`(node) => {
        const arr = Array.from([1, 2, 3])
        const str = String(node.value)
        const num = Number(node.count)
        const date = new Date()
        return Math.max(...arr) + parseInt(str)
      }`)
      expect(result.valid).toBe(true)
    })
  })

  describe('forbidden patterns', () => {
    it('rejects fetch access', () => {
      const result = validateScriptAST('(node) => fetch("/api/data")')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('fetch'))).toBe(true)
    })

    it('rejects window access', () => {
      const result = validateScriptAST('(node) => window.location.href')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('window'))).toBe(true)
    })

    it('rejects document access', () => {
      const result = validateScriptAST('(node) => document.createElement("div")')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('document'))).toBe(true)
    })

    it('rejects eval', () => {
      const result = validateScriptAST('(node) => eval("1+1")')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('eval'))).toBe(true)
    })

    it('rejects new Function()', () => {
      const result = validateScriptAST('(node) => new Function("return 1")()')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Function'))).toBe(true)
    })

    it('rejects __proto__ access', () => {
      const result = validateScriptAST('(node) => node.__proto__')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('__proto__'))).toBe(true)
    })

    it('rejects constructor access', () => {
      const result = validateScriptAST('(node) => node.constructor')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('constructor'))).toBe(true)
    })

    it('rejects async functions', () => {
      const result = validateScriptAST('async (node) => await Promise.resolve(1)')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('sync'))).toBe(true)
    })

    it('rejects setTimeout', () => {
      const result = validateScriptAST('(node) => setTimeout(() => {}, 100)')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('setTimeout'))).toBe(true)
    })

    it('rejects localStorage', () => {
      const result = validateScriptAST('(node) => localStorage.getItem("key")')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('localStorage'))).toBe(true)
    })

    it('rejects require', () => {
      const result = validateScriptAST('(node) => require("fs")')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('require'))).toBe(true)
    })

    it('rejects process', () => {
      const result = validateScriptAST('(node) => process.env.SECRET')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('process'))).toBe(true)
    })
  })

  describe('syntax errors', () => {
    it('reports syntax errors', () => {
      const result = validateScriptAST('(node) => {')
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Syntax'))).toBe(true)
    })
  })
})

describe('quickSafetyCheck', () => {
  it('returns true for safe code', () => {
    expect(quickSafetyCheck('(node) => node.amount * 1.08')).toBe(true)
  })

  it('returns false for dangerous patterns', () => {
    expect(quickSafetyCheck('import fs from "fs"')).toBe(false)
    expect(quickSafetyCheck('require("fs")')).toBe(false)
    expect(quickSafetyCheck('fetch("/api")')).toBe(false)
    expect(quickSafetyCheck('window.location')).toBe(false)
    expect(quickSafetyCheck('document.cookie')).toBe(false)
    expect(quickSafetyCheck('obj.__proto__')).toBe(false)
  })
})

describe('createScriptContext', () => {
  const testNode: FlatNode = {
    id: 'node-1',
    schemaIRI: 'xnet://test/Task',
    title: 'Test Task',
    amount: 100,
    done: false
  }

  const queryFn = () => [
    { id: 'node-2', schemaIRI: 'xnet://test/Task', title: 'Task 2', amount: 50, done: true },
    { id: 'node-3', schemaIRI: 'xnet://test/Task', title: 'Task 3', amount: 75, done: false }
  ]

  it('provides frozen node', () => {
    const ctx = createScriptContext(testNode, queryFn)
    expect(ctx.node.id).toBe('node-1')
    expect(ctx.node.title).toBe('Test Task')
    expect(Object.isFrozen(ctx.node)).toBe(true)
  })

  it('provides nodes query function', () => {
    const ctx = createScriptContext(testNode, queryFn)
    const nodes = ctx.nodes()
    expect(nodes).toHaveLength(2)
    expect(Object.isFrozen(nodes)).toBe(true)
  })

  it('provides now function', () => {
    const ctx = createScriptContext(testNode, queryFn)
    const now = ctx.now()
    expect(typeof now).toBe('number')
    expect(now).toBeGreaterThan(0)
  })

  it('provides format helpers', () => {
    const ctx = createScriptContext(testNode, queryFn)
    expect(ctx.format.currency(100)).toContain('100')
    expect(ctx.format.number(1234.5)).toContain('1,234')
    expect(ctx.format.bytes(1024)).toBe('1.0 KB')
  })

  it('provides math helpers', () => {
    const ctx = createScriptContext(testNode, queryFn)
    expect(ctx.math.sum([1, 2, 3])).toBe(6)
    expect(ctx.math.avg([2, 4, 6])).toBe(4)
    expect(ctx.math.min([5, 2, 8])).toBe(2)
    expect(ctx.math.max([5, 2, 8])).toBe(8)
    expect(ctx.math.round(3.456, 2)).toBe(3.46)
    expect(ctx.math.clamp(15, 0, 10)).toBe(10)
  })

  it('provides text helpers', () => {
    const ctx = createScriptContext(testNode, queryFn)
    expect(ctx.text.slugify('Hello World!')).toBe('hello-world')
    expect(ctx.text.truncate('Hello World', 5)).toBe('Hello...')
    expect(ctx.text.capitalize('hello')).toBe('Hello')
    expect(ctx.text.contains('Hello World', 'world')).toBe(true)
    expect(ctx.text.template('Hi {name}!', { name: 'Bob' })).toBe('Hi Bob!')
  })

  it('provides array helpers', () => {
    const ctx = createScriptContext(testNode, queryFn)
    expect(ctx.array.first([1, 2, 3])).toBe(1)
    expect(ctx.array.last([1, 2, 3])).toBe(3)
    expect(ctx.array.count([1, 2, 3])).toBe(3)
    expect(ctx.array.unique([1, 1, 2, 2, 3])).toEqual([1, 2, 3])
    expect(ctx.array.compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3])
  })
})

describe('ScriptSandbox', () => {
  const sandbox = new ScriptSandbox({ timeoutMs: 500 })

  const testNode: FlatNode = {
    id: 'node-1',
    schemaIRI: 'xnet://test/Invoice',
    subtotal: 100,
    taxRate: 0.08
  }

  const queryFn = () => []
  const ctx = createScriptContext(testNode, queryFn)

  describe('execute', () => {
    it('executes simple expression', async () => {
      const result = await sandbox.execute('(node) => node.subtotal * 1.08', ctx)
      expect(result).toBeCloseTo(108)
    })

    it('executes arrow function with block body', async () => {
      const result = await sandbox.execute(
        `(node) => {
        const tax = node.subtotal * node.taxRate
        return node.subtotal + tax
      }`,
        ctx
      )
      expect(result).toBeCloseTo(108)
    })

    it('can use context helpers', async () => {
      const result = await sandbox.execute(
        `(node, ctx) => {
        return ctx.math.round(node.subtotal * 1.08, 2)
      }`,
        ctx
      )
      expect(result).toBe(108)
    })

    it('sanitizes output', async () => {
      const result = await sandbox.execute(
        `(node) => ({
        total: node.subtotal * 1.08,
        __internal: 'should be stripped',
        nested: { value: 42 }
      })`,
        ctx
      )
      expect(result).toEqual({
        total: 108,
        nested: { value: 42 }
      })
    })

    it('strips functions from output', async () => {
      const result = await sandbox.execute(
        `(node) => ({
        value: 42,
        fn: () => {}
      })`,
        ctx
      )
      expect(result).toEqual({ value: 42 })
    })

    it('throws on invalid code', async () => {
      await expect(sandbox.execute('(node) => window.alert("hi")', ctx)).rejects.toThrow(
        ScriptValidationError
      )
    })

    it('throws on syntax error', async () => {
      await expect(sandbox.execute('(node) => {', ctx)).rejects.toThrow(ScriptValidationError)
    })
  })

  describe('executeSync', () => {
    it('executes synchronously', () => {
      const result = sandbox.executeSync('(node) => node.subtotal * 2', ctx)
      expect(result).toBe(200)
    })
  })

  describe('security', () => {
    // Note: These tests verify that AST validation correctly blocks dangerous patterns
    // The sandbox also shadows these globals, but the validator catches them first

    it('blocks window access at validation', async () => {
      await expect(sandbox.execute('(node) => window.location', ctx)).rejects.toThrow(
        ScriptValidationError
      )
    })

    it('blocks globalThis access at validation', async () => {
      await expect(sandbox.execute('(node) => globalThis.console', ctx)).rejects.toThrow(
        ScriptValidationError
      )
    })

    it('blocks eval access at validation', async () => {
      await expect(sandbox.execute('(node) => eval("1+1")', ctx)).rejects.toThrow(
        ScriptValidationError
      )
    })

    it('blocks prototype pollution attempts', async () => {
      await expect(
        sandbox.execute('(node) => node.__proto__.polluted = true', ctx)
      ).rejects.toThrow(ScriptValidationError)
    })
  })
})
