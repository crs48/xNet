/**
 * Tests for the session-less public form page + form-links client
 * (exploration 0278).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  buildPublicFormUrl,
  getOrCreateSubmissionNonce,
  parsePublicFormLocation
} from './lib/form-links'
import { PublicFormPage } from './PublicFormPage'

const definition = {
  title: 'RSVP',
  questions: [
    { fieldId: 'name', label: 'Your name', required: true, type: 'text' },
    { fieldId: 'attending', type: 'checkbox' }
  ],
  confirmation: { title: 'See you!' }
}

beforeAll(() => {
  // jsdom has no matchMedia; ThemeProvider consults it for the system theme.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as typeof window.matchMedia
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('parsePublicFormLocation / buildPublicFormUrl', () => {
  it('round-trips path-routed URLs', () => {
    const url = new URL(
      buildPublicFormUrl('tok_0123456789abcdef', 'wss://hub.example', 'https://app.example')
    )
    const parsed = parsePublicFormLocation(url)
    expect(parsed).toEqual({ token: 'tok_0123456789abcdef', hub: 'https://hub.example' })
  })

  it('parses hash-routed URLs', () => {
    const parsed = parsePublicFormLocation({
      pathname: '/app/',
      search: '',
      hash: '#/form/tok_0123456789abcdef?hub=https%3A%2F%2Fhub.example'
    })
    expect(parsed).toEqual({ token: 'tok_0123456789abcdef', hub: 'https://hub.example' })
  })

  it('returns null for non-form locations (the app boots normally)', () => {
    expect(parsePublicFormLocation({ pathname: '/db/abc', search: '', hash: '' })).toBeNull()
    expect(
      parsePublicFormLocation({ pathname: '/form/short', search: '?hub=x', hash: '' })
    ).toBeNull()
    expect(
      parsePublicFormLocation({ pathname: '/form/tok_0123456789abcdef', search: '', hash: '' })
    ).toBeNull() // no hub param
  })

  it('keeps a stable idempotency nonce per token until cleared', () => {
    const first = getOrCreateSubmissionNonce('tok-a')
    expect(getOrCreateSubmissionNonce('tok-a')).toBe(first)
    expect(getOrCreateSubmissionNonce('tok-b')).not.toBe(first)
  })
})

describe('PublicFormPage', () => {
  it('fetches the definition, renders questions, and submits with the stored nonce', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (!init || init.method === undefined) {
          return new Response(JSON.stringify({ definition, accepting: true }), { status: 200 })
        }
        return new Response(JSON.stringify({ ok: true }), { status: 202 })
      })
    )

    render(<PublicFormPage token="tok_0123456789abcdef" hub="https://hub.example" />)
    await waitFor(() => expect(screen.getByText('RSVP')).toBeTruthy())
    expect(screen.getByText('Your name')).toBeTruthy()

    const textboxes = screen.getAllByRole('textbox', { hidden: true })
    fireEvent.change(textboxes[0], { target: { value: 'Ada' } })
    fireEvent.click(screen.getByText('Submit'))

    await waitFor(() => expect(screen.getByText('See you!')).toBeTruthy())
    const post = calls.find((c) => c.init?.method === 'POST')!
    expect(post.url).toBe('https://hub.example/f/tok_0123456789abcdef')
    const body = JSON.parse(String(post.init!.body))
    expect(body.answers.name).toBe('Ada')
    expect(body.website).toBe('')
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{8,}$/)
  })

  it('shows the unavailable screen for revoked/unknown tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 }))
    )
    render(<PublicFormPage token="tok_0123456789abcdef" hub="https://hub.example" />)
    await waitFor(() => expect(screen.getByText('This form is unavailable')).toBeTruthy())
  })

  it('surfaces hub errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 }))
    )
    render(<PublicFormPage token="tok_0123456789abcdef" hub="https://hub.example" />)
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeTruthy())
  })
})
