import { act, renderHook, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { XNetProvider, type XNetConfig } from '../context'
import { useBilling } from './useBilling'

const API = 'http://hub.test'
const config: XNetConfig = { billing: { apiBase: API } }

const wrapper =
  () =>
  ({ children }: { children: ReactNode }) =>
    React.createElement(XNetProvider, { config, children })

const meState = (over: Record<string, unknown> = {}) => ({
  did: 'did:key:alice',
  customer: null,
  subscription: null,
  subscriptions: [],
  invoices: [],
  payments: [],
  ...over
})

const activeSub = {
  id: 'sub_1',
  did: 'did:key:alice',
  provider: 'stripe',
  externalRef: 'sub_1',
  status: 'active',
  priceRef: 'price_pro',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  updatedAt: 1
}

afterEach(() => vi.restoreAllMocks())

describe('useBilling', () => {
  it('loads DID-scoped billing state and derives isActive/plan', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(meState({ subscription: activeSub, subscriptions: [activeSub] })),
          {
            status: 200
          }
        )
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBilling(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isActive).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith(`${API}/billing/me`, expect.any(Object))
    expect(result.current.plan).toBe('price_pro')
    expect(result.current.status).toBe('active')
    expect(result.current.subscription?.id).toBe('sub_1')
  })

  it('reports not-active with sensible defaults when there is no subscription', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(meState()), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBilling(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isActive).toBe(false)
    expect(result.current.subscription).toBeNull()
    expect(result.current.subscriptions).toEqual([])
  })

  it('openCheckout POSTs priceRef to the hub checkout route', async () => {
    // jsdom navigation (window.location.assign) is a harmless no-op; we assert the
    // checkout POST + body, which is what actually drives the hosted-checkout flow.
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).endsWith('/billing/me')) {
        return new Response(JSON.stringify(meState()), { status: 200 })
      }
      return new Response(JSON.stringify({ url: 'https://checkout.example/x' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBilling(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.openCheckout('price_pro', { mode: 'subscription' })
    })

    const checkoutCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/billing/checkout'))
    expect(checkoutCall).toBeTruthy()
    const init = checkoutCall![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      priceRef: 'price_pro',
      mode: 'subscription'
    })
  })

  it('surfaces an error when the hub responds non-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    )
    const { result } = renderHook(() => useBilling(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.isActive).toBe(false)
  })
})
