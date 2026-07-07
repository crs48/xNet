/**
 * Public form link client (exploration 0278).
 *
 * URL shape: `<app>/form/<token>?hub=<hubHttpUrl>` (hash-routed deploys carry
 * the same path inside the hash). The token is the credential — the hub
 * stores only its hash — and the page needs no xNet session: the respondent
 * fetches the owner-published definition from the hub and POSTs answers back
 * with a per-token idempotency nonce that survives page reloads, so retrying
 * a flaky submit can never double-enter.
 */

import { normalizeHubHttpUrl } from './share-links'

const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const USE_HASH_ROUTER = import.meta.env.VITE_USE_HASH_ROUTER === 'true'

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/

export type PublicFormLocation = { token: string; hub: string }

/** Build the shareable URL for a minted form token. */
export function buildPublicFormUrl(token: string, hubHttpUrl: string, origin?: string): string {
  const base = `${origin ?? window.location.origin}${BASE_PATH}`
  const path = `/form/${token}?hub=${encodeURIComponent(normalizeHubHttpUrl(hubHttpUrl))}`
  return USE_HASH_ROUTER ? `${base}/#${path}` : `${base}${path}`
}

/**
 * Detect a public form URL from a window location (both routing modes).
 * Returns null when this is not a form page — the app boots normally.
 */
export function parsePublicFormLocation(location: {
  pathname: string
  hash: string
  search: string
}): PublicFormLocation | null {
  const fromParts = (path: string, query: string): PublicFormLocation | null => {
    const match = /(?:^|\/)form\/([A-Za-z0-9_-]+)$/.exec(path.replace(/\/$/, ''))
    if (!match || !TOKEN_RE.test(match[1])) return null
    const hub = new URLSearchParams(query).get('hub')
    if (!hub) return null
    return { token: match[1], hub: normalizeHubHttpUrl(hub) }
  }

  const hash = location.hash.replace(/^#/, '')
  if (hash.startsWith('/')) {
    const [path, query = ''] = hash.split('?')
    const parsed = fromParts(path, query)
    if (parsed) return parsed
  }
  return fromParts(location.pathname, location.search.replace(/^\?/, ''))
}

export type PublicFormPayload = {
  definition: {
    title?: string
    description?: string
    questions: Array<{
      fieldId: string
      label?: string
      description?: string
      required?: boolean
      type: string
      options?: Array<{ id: string; name: string; color?: string }>
    }>
    rules?: Record<string, unknown>
    submitLabel?: string
    confirmation?: { title?: string; body?: string }
  }
  accepting: boolean
}

/** Fetch the owner-published definition (no auth). Null on 404/revoked. */
export async function fetchPublicForm(
  hub: string,
  token: string
): Promise<PublicFormPayload | null> {
  const response = await fetch(`${normalizeHubHttpUrl(hub)}/f/${encodeURIComponent(token)}`, {
    cache: 'no-store'
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Form could not be loaded (${response.status})`)
  return (await response.json()) as PublicFormPayload
}

/** POST a response (no auth). Resolves false on a closed form. */
export async function submitPublicForm(
  hub: string,
  token: string,
  input: { nonce: string; answers: Record<string, unknown>; honeypot: string }
): Promise<boolean> {
  const response = await fetch(`${normalizeHubHttpUrl(hub)}/f/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nonce: input.nonce,
      answers: input.answers,
      website: input.honeypot
    })
  })
  return response.ok
}

const nonceKey = (token: string): string => `xnet:form-nonce:${token}`

/**
 * Idempotency nonce for this browser+token, generated once and kept until
 * the submission succeeds — a retried POST after a network hiccup lands on
 * the same inbox row.
 */
export function getOrCreateSubmissionNonce(token: string): string {
  try {
    const existing = sessionStorage.getItem(nonceKey(token))
    if (existing) return existing
  } catch {
    // sessionStorage unavailable → fall through to a fresh nonce
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  const nonce = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  try {
    sessionStorage.setItem(nonceKey(token), nonce)
  } catch {
    // best effort
  }
  return nonce
}

/** Drop the stored nonce after a confirmed submission. */
export function clearSubmissionNonce(token: string): void {
  try {
    sessionStorage.removeItem(nonceKey(token))
  } catch {
    // ignore
  }
}
