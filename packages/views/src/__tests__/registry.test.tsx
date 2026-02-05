/**
 * Tests for ViewRegistry
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ViewRegistry, type ViewRegistration, type ViewProps } from '../registry.js'

// Mock view component
function MockView(_props: ViewProps): React.JSX.Element {
  return React.createElement('div', null, 'Mock View')
}

function createTestView(overrides: Partial<ViewRegistration> = {}): ViewRegistration {
  return {
    type: 'test',
    name: 'Test View',
    icon: 'test-icon',
    component: MockView,
    ...overrides
  }
}

describe('ViewRegistry', () => {
  let registry: ViewRegistry

  beforeEach(() => {
    registry = new ViewRegistry()
  })

  describe('register', () => {
    it('registers a view', () => {
      const view = createTestView()
      registry.register(view)

      expect(registry.has('test')).toBe(true)
      expect(registry.get('test')).toEqual(view)
    })

    it('returns a disposable that unregisters the view', () => {
      const view = createTestView()
      const disposable = registry.register(view)

      expect(registry.has('test')).toBe(true)

      disposable.dispose()

      expect(registry.has('test')).toBe(false)
    })

    it('warns when overriding an existing view', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      registry.register(createTestView())
      registry.register(createTestView({ name: 'Test View 2' }))

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Overriding existing view type 'test'")
      )

      warnSpy.mockRestore()
    })
  })

  describe('get', () => {
    it('returns undefined for unregistered view', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })

    it('returns the registered view', () => {
      const view = createTestView()
      registry.register(view)

      expect(registry.get('test')).toEqual(view)
    })
  })

  describe('getAll', () => {
    it('returns empty array when no views registered', () => {
      expect(registry.getAll()).toEqual([])
    })

    it('returns all registered views', () => {
      const view1 = createTestView({ type: 'test1', name: 'Test 1' })
      const view2 = createTestView({ type: 'test2', name: 'Test 2' })

      registry.register(view1)
      registry.register(view2)

      const all = registry.getAll()
      expect(all).toHaveLength(2)
      expect(all).toContainEqual(view1)
      expect(all).toContainEqual(view2)
    })
  })

  describe('getForSchema', () => {
    it('returns all views when no schema restrictions', () => {
      registry.register(createTestView({ type: 'test1' }))
      registry.register(createTestView({ type: 'test2' }))

      const views = registry.getForSchema('xnet://test/Schema' as `xnet://${string}/${string}`)
      expect(views).toHaveLength(2)
    })

    it('returns views with wildcard schema support', () => {
      registry.register(createTestView({ type: 'test1', supportedSchemas: '*' }))

      const views = registry.getForSchema('xnet://test/Any' as `xnet://${string}/${string}`)
      expect(views).toHaveLength(1)
    })

    it('filters by specific schema', () => {
      const schema1 = 'xnet://test/Schema1' as `xnet://${string}/${string}`
      const schema2 = 'xnet://test/Schema2' as `xnet://${string}/${string}`

      registry.register(createTestView({ type: 'test1', supportedSchemas: [schema1] }))
      registry.register(createTestView({ type: 'test2', supportedSchemas: [schema2] }))
      registry.register(createTestView({ type: 'test3', supportedSchemas: [schema1, schema2] }))

      const views1 = registry.getForSchema(schema1)
      expect(views1).toHaveLength(2)
      expect(views1.map((v) => v.type)).toContain('test1')
      expect(views1.map((v) => v.type)).toContain('test3')

      const views2 = registry.getForSchema(schema2)
      expect(views2).toHaveLength(2)
      expect(views2.map((v) => v.type)).toContain('test2')
      expect(views2.map((v) => v.type)).toContain('test3')
    })
  })

  describe('getForPlatform', () => {
    it('returns all views when no platform restrictions', () => {
      registry.register(createTestView({ type: 'test1' }))
      registry.register(createTestView({ type: 'test2' }))

      const views = registry.getForPlatform('web')
      expect(views).toHaveLength(2)
    })

    it('filters by platform', () => {
      registry.register(createTestView({ type: 'test1', platforms: ['web'] }))
      registry.register(createTestView({ type: 'test2', platforms: ['electron'] }))
      registry.register(createTestView({ type: 'test3', platforms: ['web', 'electron'] }))

      const webViews = registry.getForPlatform('web')
      expect(webViews).toHaveLength(2)
      expect(webViews.map((v) => v.type)).toContain('test1')
      expect(webViews.map((v) => v.type)).toContain('test3')

      const electronViews = registry.getForPlatform('electron')
      expect(electronViews).toHaveLength(2)
      expect(electronViews.map((v) => v.type)).toContain('test2')
      expect(electronViews.map((v) => v.type)).toContain('test3')
    })
  })

  describe('onChange', () => {
    it('notifies listeners when a view is registered', () => {
      const listener = vi.fn()
      registry.onChange(listener)

      registry.register(createTestView())

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notifies listeners when a view is unregistered', () => {
      const listener = vi.fn()
      const disposable = registry.register(createTestView())

      registry.onChange(listener)
      disposable.dispose()

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('returns unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = registry.onChange(listener)

      unsubscribe()
      registry.register(createTestView())

      expect(listener).not.toHaveBeenCalled()
    })

    it('continues notifying other listeners if one throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const listener1 = vi.fn(() => {
        throw new Error('test error')
      })
      const listener2 = vi.fn()

      registry.onChange(listener1)
      registry.onChange(listener2)

      registry.register(createTestView())

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalled()

      errorSpy.mockRestore()
    })
  })

  describe('size', () => {
    it('returns 0 when empty', () => {
      expect(registry.size).toBe(0)
    })

    it('returns correct count', () => {
      registry.register(createTestView({ type: 'test1' }))
      registry.register(createTestView({ type: 'test2' }))

      expect(registry.size).toBe(2)
    })
  })

  describe('clear', () => {
    it('removes all views', () => {
      registry.register(createTestView({ type: 'test1' }))
      registry.register(createTestView({ type: 'test2' }))

      registry.clear()

      expect(registry.size).toBe(0)
      expect(registry.getAll()).toEqual([])
    })

    it('notifies listeners', () => {
      const listener = vi.fn()
      registry.register(createTestView())
      registry.onChange(listener)

      registry.clear()

      expect(listener).toHaveBeenCalled()
    })
  })
})
