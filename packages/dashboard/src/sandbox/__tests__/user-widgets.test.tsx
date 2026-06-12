/**
 * User-widget registration and editor tests.
 */

import type { DID } from '@xnetjs/core'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, UserWidgetSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useMutate, useQuery } from '@xnetjs/react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { WidgetRegistry } from '../../registry'
import {
  DEFAULT_USER_WIDGET_CODE,
  USER_WIDGET_TYPE_PREFIX,
  UserWidgetEditor,
  userWidgetDefinition,
  useUserWidgets
} from '../user-widgets'

function Harness({ children }: { children: ReactNode }) {
  const identity = useMemo(() => generateIdentity(), [])
  const storage = useMemo(() => new MemoryNodeStorageAdapter(), [])

  return (
    <XNetProvider
      config={{
        nodeStorage: storage,
        authorDID: identity.identity.did as DID,
        signingKey: identity.privateKey
      }}
    >
      {children}
    </XNetProvider>
  )
}

describe('userWidgetDefinition', () => {
  it('builds a user-tier definition with coerced fields', () => {
    const definition = userWidgetDefinition({
      id: 'node-1',
      name: 'Burndown',
      description: 'My burndown',
      code: 'function render() { return "x" }',
      configFields: [{ key: 'goal', label: 'Goal', type: 'number' }],
      defaultSize: { w: 6, h: 4 }
    })

    expect(definition.type).toBe(`${USER_WIDGET_TYPE_PREFIX}node-1`)
    expect(definition.trustTier).toBe('user')
    expect(definition.configFields).toEqual([{ key: 'goal', label: 'Goal', type: 'number' }])
    expect(definition.defaultSize).toMatchObject({ w: 6, h: 4 })
    expect(definition.getStubConfig({ schemas: [] }).query?.refresh).toBe('live')
  })

  it('falls back to defaults for missing fields', () => {
    const definition = userWidgetDefinition({ id: 'node-2' })

    expect(definition.name).toBe('User widget')
    expect(definition.description).toBeUndefined()
    expect(definition.configFields).toEqual([{ key: 'title', label: 'Title', type: 'text' }])
    expect(definition.defaultSize).toMatchObject({ w: 3, h: 3 })
  })
})

describe('useUserWidgets', () => {
  function RegistryProbe({ registry }: { registry: WidgetRegistry }) {
    const { create } = useMutate()
    const { loading } = useQuery(UserWidgetSchema)
    const seeded = useRef(false)
    useUserWidgets(registry)

    useEffect(() => {
      if (loading || seeded.current) return
      seeded.current = true
      void create(UserWidgetSchema, { name: 'Mine', code: DEFAULT_USER_WIDGET_CODE })
    }, [create, loading])

    return null
  }

  it('registers UserWidgetSchema nodes as user-tier widgets', async () => {
    const registry = new WidgetRegistry()
    const { unmount } = render(
      <Harness>
        <RegistryProbe registry={registry} />
      </Harness>
    )

    await waitFor(() => {
      const registered = registry
        .getAll()
        .find((widget) => widget.type.startsWith(USER_WIDGET_TYPE_PREFIX))
      expect(registered?.trustTier).toBe('user')
      expect(registered?.name).toBe('Mine')
    })

    unmount()
    expect(
      registry.getAll().some((widget) => widget.type.startsWith(USER_WIDGET_TYPE_PREFIX))
    ).toBe(false)
  })
})

describe('UserWidgetEditor', () => {
  function EditorProbe({ onSaved }: { onSaved: (count: number | null) => void }) {
    const { data, loading } = useQuery(UserWidgetSchema)
    useEffect(() => {
      onSaved(loading ? null : (data?.length ?? 0))
    }, [data, loading, onSaved])
    return <UserWidgetEditor onClose={() => {}} />
  }

  it('saves a new user widget node', async () => {
    let count: number | null = null
    render(
      <Harness>
        <EditorProbe
          onSaved={(next) => {
            count = next
          }}
        />
      </Harness>
    )

    // Let the list subscription settle before mutating.
    await waitFor(() => expect(count).toBe(0))

    const name = document.querySelector('input[type="text"]')!
    fireEvent.change(name, { target: { value: 'Saved widget' } })
    const save = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save widget')
    )!
    fireEvent.click(save)

    await waitFor(() => expect(count).toBe(1))
  })
})
