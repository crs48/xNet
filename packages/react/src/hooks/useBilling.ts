/**
 * useBilling — reactive billing state + checkout, the same shape as `useIdentity`.
 *
 * Reads the caller's own DID-scoped billing from the hub (`GET /billing/me`) and
 * exposes `openCheckout` / `openPortal`, which call the hub (secret key stays
 * server-side) and redirect to the returned hosted URL. The client needs no
 * Stripe secret — only the hub URL it already has. See exploration 0187.
 *
 * Types come from `@xnetjs/billing` as a type-only import, so nothing pulls
 * `node:crypto`/the provider adapters into the browser bundle.
 */
import type { BillingState, Customer, Invoice, Payment, Subscription } from '@xnetjs/billing'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { XNetContext } from '../context'

const toHttpUrl = (hubUrl: string): string => {
  try {
    const url = new URL(hubUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return hubUrl
  }
}

export interface CheckoutOptions {
  /** `subscription` (default) for recurring, `payment` for one-shot (e.g. Bitcoin). */
  mode?: 'subscription' | 'payment'
  successUrl?: string
  cancelUrl?: string
  customerEmail?: string
}

export interface UseBillingResult {
  /** The most relevant subscription (active/trialing first), or null. */
  subscription: Subscription | null
  /** True when the subscription is active or trialing. */
  isActive: boolean
  /** The active subscription's price/plan ref, or null. */
  plan: string | null
  status: Subscription['status'] | null
  customer: Customer | null
  subscriptions: Subscription[]
  invoices: Invoice[]
  payments: Payment[]
  loading: boolean
  error: Error | null
  /** Re-fetch billing state from the hub. */
  reload: () => Promise<void>
  /** Start hosted checkout for a price/plan and redirect to it. */
  openCheckout: (priceRef: string, options?: CheckoutOptions) => Promise<void>
  /** Open the provider's customer portal (Stripe) and redirect to it. */
  openPortal: (returnUrl?: string) => Promise<void>
  /** Stripe publishable key, if configured (for future embedded checkout). */
  publishableKey: string | null
}

export function useBilling(): UseBillingResult {
  const context = useContext(XNetContext)
  const [state, setState] = useState<BillingState | null>(null)
  const [loading, setLoading] = useState<boolean>(
    Boolean(context?.hubUrl || context?.billing?.apiBase)
  )
  const [error, setError] = useState<Error | null>(null)

  const apiBase = useMemo(() => {
    if (context?.billing?.apiBase) return context.billing.apiBase.replace(/\/$/, '')
    return context?.hubUrl ? toHttpUrl(context.hubUrl) : null
  }, [context?.billing?.apiBase, context?.hubUrl])

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = context?.getHubAuthToken ? await context.getHubAuthToken() : ''
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [context])

  const reload = useCallback(async (): Promise<void> => {
    if (!apiBase) {
      setState(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/billing/me`, { headers: await authHeaders() })
      if (!res.ok) throw new Error(`Billing fetch failed: ${res.status}`)
      setState((await res.json()) as BillingState)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [apiBase, authHeaders])

  useEffect(() => {
    void reload()
  }, [reload])

  const redirectVia = useCallback(
    async (path: string, body: Record<string, unknown>): Promise<void> => {
      if (!apiBase) throw new Error('Hub URL not configured')
      const res = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
      const { url } = (await res.json()) as { url: string }
      if (typeof window !== 'undefined') window.location.assign(url)
    },
    [apiBase, authHeaders]
  )

  const openCheckout = useCallback(
    (priceRef: string, options: CheckoutOptions = {}): Promise<void> =>
      redirectVia('/billing/checkout', {
        priceRef,
        ...(options.mode ? { mode: options.mode } : {}),
        ...(options.successUrl ? { successUrl: options.successUrl } : {}),
        ...(options.cancelUrl ? { cancelUrl: options.cancelUrl } : {}),
        ...(options.customerEmail ? { customerEmail: options.customerEmail } : {})
      }),
    [redirectVia]
  )

  const openPortal = useCallback(
    (returnUrl?: string): Promise<void> =>
      redirectVia('/billing/portal', returnUrl ? { returnUrl } : {}),
    [redirectVia]
  )

  const subscription = state?.subscription ?? null
  return {
    subscription,
    isActive: subscription?.status === 'active' || subscription?.status === 'trialing',
    plan: subscription?.priceRef ?? null,
    status: subscription?.status ?? null,
    customer: state?.customer ?? null,
    subscriptions: state?.subscriptions ?? [],
    invoices: state?.invoices ?? [],
    payments: state?.payments ?? [],
    loading,
    error,
    reload,
    openCheckout,
    openPortal,
    publishableKey: context?.billing?.publishableKey ?? null
  }
}
