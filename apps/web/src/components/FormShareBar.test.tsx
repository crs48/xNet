/**
 * Tests for FormShareBar + useFormLinks/publishableDefinition
 * (exploration 0278): minting shows the URL once, republish keeps the
 * snapshot fresh, and the published definition passes the public gate.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishableDefinition } from '../hooks/useFormLinks'
import { FormShareBar } from './FormShareBar'

const fields = [
  { id: 'name', name: 'Name', type: 'text', config: {} },
  {
    id: 'diet',
    name: 'Diet',
    type: 'select',
    config: {},
    options: [{ id: 'veg', name: 'Veg', color: 'green' }]
  },
  { id: 'owner', name: 'Owner', type: 'person', config: {} }
]

const config = {
  title: 'RSVP',
  questions: [{ fieldId: 'name', required: true }, { fieldId: 'diet' }, { fieldId: 'owner' }]
}

function Wrapper({ children }: { children: ReactNode }) {
  const { identity, privateKey } = generateIdentity()
  return (
    <XNetProvider
      config={{
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: identity.did as never,
        signingKey: privateKey,
        disableSyncManager: true,
        hubUrl: 'https://hub.example',
        hubOptions: { authToken: 'test-token', autoAuth: false }
      }}
    >
      {children}
    </XNetProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('publishableDefinition', () => {
  it('applies the public gate and resolved select options', () => {
    const def = publishableDefinition(config, {}, fields)
    expect(def.questions.map((q) => q.fieldId)).toEqual(['name', 'diet'])
    expect(def.questions[1].options).toEqual([{ id: 'veg', name: 'Veg', color: 'green' }])
  })
})

describe('FormShareBar', () => {
  function stubHub() {
    const state = { forms: [] as Array<Record<string, unknown>>, patches: [] as unknown[] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (url.endsWith('/forms') && method === 'POST') {
          const body = JSON.parse(String(init!.body))
          const record = {
            token: 'tok_0123456789abcdef',
            tokenHash: 'hash-1',
            viewId: body.viewId,
            databaseId: body.databaseId,
            space: body.space,
            label: null,
            accepting: true,
            disabled: false,
            expiresAt: 0,
            createdAt: 1
          }
          state.forms = [{ ...record, pending: 0, rejected: 2 }]
          return new Response(JSON.stringify(record), { status: 201 })
        }
        if (url.includes('/forms?viewId=')) {
          return new Response(JSON.stringify({ forms: state.forms }), { status: 200 })
        }
        if (method === 'PATCH') {
          state.patches.push(JSON.parse(String(init!.body)))
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        if (method === 'DELETE') {
          state.forms = []
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response('{}', { status: 404 })
      })
    )
    return state
  }

  it('mints a public link and shows the URL with pending/rejected chips', async () => {
    stubHub()
    render(
      <FormShareBar
        viewId="view-1"
        databaseId="db-1"
        space="space-1"
        accepting
        config={config}
        rules={{}}
        fields={fields}
      />,
      { wrapper: Wrapper }
    )

    await waitFor(() => expect(screen.getByText('Share form publicly')).toBeTruthy())
    fireEvent.click(screen.getByText('Share form publicly'))

    await waitFor(() => expect(screen.getByText(/tok_0123456789abcdef/)).toBeTruthy())
    expect(screen.getByText(/\/form\/tok_0123456789abcdef/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('2 rejected')).toBeTruthy())
  })

  it('disables minting when no question survives the public gate', async () => {
    stubHub()
    render(
      <FormShareBar
        viewId="view-2"
        databaseId="db-1"
        space="space-1"
        accepting
        config={{ questions: [{ fieldId: 'owner' }] }} // person-only → nothing public
        rules={{}}
        fields={fields}
      />,
      { wrapper: Wrapper }
    )
    await waitFor(() =>
      expect((screen.getByText('Share form publicly') as HTMLButtonElement).disabled).toBe(true)
    )
  })
})
