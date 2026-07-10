/**
 * Share bridge route.
 *
 * Attempts to launch Electron via xnet:// deep link and falls back to the web app.
 *
 * Accepted inputs (query params live in the hash query under hash routing):
 * - `?link=<linkId>&hub=<hubUrl>` + secret in `s` (hash query) or `#s=` fragment
 *   — durable share links (exploration 0169); claimed against the issuing hub.
 * - `?handle=sh_…` — one-shot device-handoff handles.
 * - `?payload=…` — self-contained share payloads (QR / P2P form).
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useXNet } from '@xnetjs/react'
import { useEffect, useMemo, useState } from 'react'
import {
  claimErrorText,
  claimShareLink,
  decideClaimDestination,
  docRouteFor,
  parseShareRouteInput,
  type ShareRouteInput
} from '../lib/share-links'

const DEEP_LINK_TIMEOUT_MS = 1000
const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const USE_HASH_ROUTER = import.meta.env.VITE_USE_HASH_ROUTER === 'true'
const SHARE_HANDLE_RE = /^sh_[A-Za-z0-9_-]{16,}$/

type ShareDocType = 'page' | 'database' | 'canvas' | 'dashboard' | 'view' | 'space' | 'workspace'

type SharePayloadV2 = {
  v: 2
  resource: string
  docType: ShareDocType
  endpoint?: string
  token?: string
  exp?: number
}

type RedeemedShare = {
  endpoint: string
  token: string
  resource: string
  docType: ShareDocType
  exp: number
}

export const Route = createFileRoute('/share')({
  component: ShareBridgePage
})

function ShareBridgePage(): JSX.Element {
  const [status, setStatus] = useState<'launching' | 'fallback' | 'error'>('launching')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { getHubAuthToken, hubUrl } = useXNet()

  const shareInput = useMemo<ShareRouteInput>(() => parseShareRouteInput(window.location), [])

  useEffect(() => {
    // Scrub the claim inputs from the address bar/history once they're read.
    // Keep the hash only when it's a hash-router ROUTE (`#/...`); a bare
    // fragment is the `#s=` secret on path-routed deployments — the one thing
    // this sanitizer exists to remove (0290 follow-up).
    const rawHash = window.location.hash
    const routeHash = rawHash.startsWith('#/') ? rawHash.split('?')[0] : ''
    const sanitizedPath = `${window.location.pathname}${routeHash}`
    window.history.replaceState({}, '', sanitizedPath)
    document.documentElement.setAttribute('data-nosnippet', 'true')

    let referrerMeta = document.querySelector('meta[name="referrer"]') as HTMLMetaElement | null
    if (!referrerMeta) {
      referrerMeta = document.createElement('meta')
      referrerMeta.name = 'referrer'
      document.head.appendChild(referrerMeta)
    }
    referrerMeta.content = 'no-referrer'
  }, [])

  useEffect(() => {
    if (shareInput.kind === 'missing') {
      setStatus('error')
      setError('Missing link, handle, or payload in share link')
      return
    }

    if (shareInput.kind === 'link') {
      const input = shareInput.value

      const claim = async (): Promise<void> => {
        if (!getHubAuthToken) {
          throw new Error('Hub authentication is not available')
        }
        const token = await getHubAuthToken()
        const result = await claimShareLink(input, token)
        const destination = decideClaimDestination(result.endpoint, input.hub, hubUrl)

        if (destination.kind === 'navigate') {
          // Visiting the doc subscribes + materializes it locally,
          // which pins it into the workspace sidebar.
          const route = docRouteFor(result.docType, result.resource)
          void navigate({ to: route.to, params: route.params } as never)
          return
        }

        // The doc lives on a different hub than this app is connected to:
        // store a hub session and reload so the app boots against it.
        const key = persistShareSession({
          endpoint: destination.endpoint,
          token,
          resource: result.resource,
          docType: result.docType,
          exp: Date.now() + 10 * 60_000
        })
        window.location.replace(getWebFallbackPath(result.docType, result.resource, key))
      }

      window.location.href = `xnet://share?link=${encodeURIComponent(input.linkId)}&hub=${encodeURIComponent(input.hub)}#s=${encodeURIComponent(input.secret)}`

      const timeout = window.setTimeout(() => {
        setStatus('fallback')
        void claim().catch((err) => {
          setStatus('error')
          setError(claimErrorText(err))
        })
      }, DEEP_LINK_TIMEOUT_MS)

      return () => {
        window.clearTimeout(timeout)
      }
    }

    if (shareInput.kind === 'handle') {
      const handle = shareInput.value.trim()
      if (!SHARE_HANDLE_RE.test(handle)) {
        setStatus('error')
        setError('Share handle is invalid')
        return
      }

      window.location.href = `xnet://share?handle=${encodeURIComponent(handle)}`

      const timeout = window.setTimeout(() => {
        setStatus('fallback')
        void fallbackWithHandle(handle).catch((err) => {
          setStatus('error')
          setError(err instanceof Error ? err.message : String(err))
        })
      }, DEEP_LINK_TIMEOUT_MS)

      return () => {
        window.clearTimeout(timeout)
      }
    }

    const payload = shareInput.value
    if (payload.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(payload)) {
      setStatus('error')
      setError('Share payload is invalid')
      return
    }

    window.location.href = `xnet://share?payload=${encodeURIComponent(payload)}`

    const timeout = window.setTimeout(() => {
      setStatus('fallback')

      const parsedPayload = decodeSharePayload(payload)
      if (!parsedPayload) {
        setStatus('error')
        setError('Share payload is invalid')
        return
      }

      const key = persistShareSession({
        endpoint: parsedPayload.endpoint ?? resolveWsHubUrl(),
        token: parsedPayload.token ?? '',
        resource: parsedPayload.resource,
        docType: parsedPayload.docType,
        exp: parsedPayload.exp ?? Date.now() + 60_000
      })

      window.location.replace(
        getWebFallbackPath(parsedPayload.docType, parsedPayload.resource, key)
      )
    }, DEEP_LINK_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [shareInput, navigate, getHubAuthToken, hubUrl])

  const copySupportCode = async () => {
    if (shareInput.kind === 'missing') return
    const value = shareInput.kind === 'link' ? shareInput.value.linkId : shareInput.value
    const masked = maskSecretValue(value)
    await navigator.clipboard.writeText(`xnet-share-debug kind=${shareInput.kind} value=${masked}`)
  }

  return (
    <div className="max-w-xl mx-auto py-16">
      <h1 className="text-2xl font-semibold mb-3">Opening your shared document...</h1>
      <p className="text-sm text-muted-foreground mb-6">
        We will open the desktop app if available, then continue in web automatically.
      </p>

      {status === 'fallback' && (
        <p className="text-sm text-muted-foreground mb-4">
          Electron did not open, so we continued in web.
        </p>
      )}

      {status === 'error' && error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <button
        onClick={copySupportCode}
        className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent"
      >
        Copy support code
      </button>
    </div>
  )
}

function maskSecretValue(value: string): string {
  const normalized = value.trim()
  if (normalized.length <= 12) {
    return `len:${normalized.length}`
  }
  const prefix = normalized.slice(0, 6)
  const suffix = normalized.slice(-4)
  return `${prefix}...${suffix} (len:${normalized.length})`
}

async function fallbackWithHandle(handle: string): Promise<void> {
  const hubHttpUrl = resolveHubHttpUrl()
  if (!hubHttpUrl) {
    throw new Error('Hub URL is not configured')
  }

  const response = await fetch(`${hubHttpUrl}/shares/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
    cache: 'no-store'
  })

  const data = (await response.json().catch(() => null)) as
    | RedeemedShare
    | { error?: string }
    | null

  if (!response.ok || !data || !('endpoint' in data)) {
    const reason = data && 'error' in data ? data.error : null
    throw new Error(reason ?? 'Secure share link is invalid or expired')
  }

  const key = persistShareSession(data)
  window.location.replace(getWebFallbackPath(data.docType, data.resource, key))
}

function resolveHubHttpUrl(): string | null {
  const hubUrl = import.meta.env.VITE_HUB_URL as string | undefined
  if (!hubUrl) {
    return null
  }
  return hubUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')
}

function resolveWsHubUrl(): string {
  const hubUrl = import.meta.env.VITE_HUB_URL as string | undefined
  return hubUrl || 'wss://hub.xnet.fyi'
}

function persistShareSession(share: RedeemedShare): string {
  const key = `share-${crypto.randomUUID()}`
  sessionStorage.setItem(`xnet:share-session:${key}`, JSON.stringify(share))
  return key
}

function decodeSharePayload(encodedPayload: string): SharePayloadV2 | null {
  try {
    const json = fromBase64Url(encodedPayload)
    const decoded = JSON.parse(json) as SharePayloadV2
    if (
      decoded?.v !== 2 ||
      typeof decoded.resource !== 'string' ||
      (decoded.docType !== 'page' && decoded.docType !== 'database' && decoded.docType !== 'canvas')
    ) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function getWebFallbackPath(docType: ShareDocType, resource: string, shareSession: string): string {
  const query = `shareSession=${encodeURIComponent(shareSession)}`
  const prefix = BASE_PATH === '' ? '' : BASE_PATH
  // Hash-routed deployments (GitHub Pages) only resolve routes inside the
  // fragment — a bare path 404s on the static host.
  const routePrefix = USE_HASH_ROUTER ? `${prefix}/#` : prefix

  const docPath: Record<ShareDocType, string> = {
    page: `/doc/${encodeURIComponent(resource)}`,
    database: `/db/${encodeURIComponent(resource)}`,
    canvas: `/canvas/${encodeURIComponent(resource)}`,
    dashboard: `/dashboard/${encodeURIComponent(resource)}`,
    view: `/view/${encodeURIComponent(resource)}`,
    space: `/space/${encodeURIComponent(resource)}`,
    // Workspaces have no viewer route; land home — the granted node syncs
    // and appears in the receiver's workspace switcher (0280).
    workspace: `/?sharedWorkspace=${encodeURIComponent(resource)}`
  }

  return `${routePrefix}${docPath[docType]}?${query}`
}
