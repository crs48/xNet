/**
 * ShareButton - Copy document ID for sharing
 *
 * Works with any document type (Page, Database, Canvas).
 * Future: Could be extended to share specific rows/blocks.
 */

import type { DID, GrantInput } from '@xnet/data'
import { generateIdentity } from '@xnet/identity'
import { useXNet } from '@xnet/react'
import { Share2, Check, Copy } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { buildUniversalShareHandleUrl, type ShareDocType } from '../lib/share-payload'

interface ShareButtonProps {
  docId: string
  docType: 'page' | 'database' | 'canvas'
}

export function ShareButton({ docId, docType }: ShareButtonProps) {
  const { authorDID, nodeStore, nodeStoreReady, getHubAuthToken } = useXNet()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [shareValue, setShareValue] = useState<string>('')
  const [activeGrantId, setActiveGrantId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [tunnelStatus, setTunnelStatus] = useState<Awaited<
    ReturnType<typeof window.xnetTunnel.status>
  > | null>(null)

  useEffect(() => {
    let mounted = true

    window.xnetTunnel
      .status()
      .then((status) => {
        if (mounted) {
          setTunnelStatus(status)
        }
      })
      .catch(() => {
        // Keep UI functional if tunnel APIs are unavailable.
      })

    const unsubscribe = window.xnetTunnel.onHealthChange((status) => {
      if (mounted) {
        setTunnelStatus(status)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const handleShareSecurely = async () => {
    if (isGenerating) {
      return
    }

    try {
      setIsGenerating(true)
      setError(null)
      setStatusMessage(null)

      if (!nodeStore || !authorDID) {
        setError('Secure sharing is still initializing. Please wait a moment and try again.')
        return
      }

      const guestIdentity = generateIdentity()
      const guestDid = guestIdentity.identity.did as DID

      if (!nodeStore.auth) {
        setError('Secure sharing requires authorization. Anonymous share links are disabled.')
        return
      }

      const grant = await nodeStore.auth.grant({
        to: guestDid,
        actions: ['read', 'write'],
        resource: docId,
        expiresIn: 30 * 60 * 1000
      } satisfies GrantInput)

      const token = grant.ucanToken ?? grant.id
      const grantId = grant.id
      const grantExpiry = grant.expiresAt || Date.now() + 30 * 60 * 1000

      let endpoint = import.meta.env.VITE_HUB_URL || 'ws://localhost:4444'
      const status = await window.xnetTunnel.start({ mode: 'temporary' })
      setTunnelStatus(status)

      if (status.health === 'degraded') {
        setError(status.message || 'Tunnel failed to start')
        return
      }

      if (status.endpoint) {
        endpoint = status.endpoint.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
      }

      const hubHttpBase = toHttpUrl(endpoint)
      const authToken = getHubAuthToken ? await getHubAuthToken() : ''
      const issueResponse = await fetch(`${hubHttpBase}/shares/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          endpoint,
          token,
          resource: docId,
          docType: docType as ShareDocType,
          exp: grantExpiry
        })
      })

      if (!issueResponse.ok) {
        const errBody = (await issueResponse.json().catch(() => null)) as { error?: string } | null
        throw new Error(errBody?.error ?? 'Hub rejected secure share issuance')
      }

      const issued = (await issueResponse.json()) as { handle: string; exp: number }
      const universalUrl = buildUniversalShareHandleUrl({
        handle: issued.handle,
        useHashRouting: true
      })

      setShareValue(universalUrl)
      setActiveGrantId(grantId)
      setExpiresAt(issued.exp)
      await navigator.clipboard.writeText(universalUrl)
      setStatusMessage('Secure link active. Copied to clipboard.')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to create secure share link:', err)
      setError(`Could not create secure link: ${message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      setStatusMessage('Copied to clipboard.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCopyLegacy = async () => {
    const legacyShare = `${docType}:${docId}`
    try {
      await navigator.clipboard.writeText(legacyShare)
      setStatusMessage('Copied legacy share ID.')
      setError(null)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRevoke = async () => {
    if (!activeGrantId || !nodeStore?.auth) {
      return
    }

    try {
      setRevoking(true)
      setError(null)
      await nodeStore.auth.revoke({ grantId: activeGrantId })
      setActiveGrantId(null)
      setExpiresAt(null)
      setStatusMessage('Secure link revoked.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRevoking(false)
    }
  }

  const typeLabel = {
    page: 'Page',
    database: 'Database',
    canvas: 'Canvas'
  }[docType]

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        title="Share"
      >
        <Share2 size={14} />
        <span>Share</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Popover */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Share {typeLabel}</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              Click <strong>Share securely</strong> to generate and copy a temporary link. The
              recipient can paste it in <strong>Open Shared</strong> to access this{' '}
              {typeLabel.toLowerCase()}.
            </p>

            {!nodeStoreReady && (
              <p className="text-xs text-amber-400 mb-3">
                Preparing secure sharing for this page...
              </p>
            )}

            <div className="flex gap-2 mb-2">
              <button
                onClick={handleShareSecurely}
                disabled={isGenerating || !nodeStoreReady}
                className="px-3 py-2 rounded-md text-sm bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Share securely'}
              </button>
              <button
                onClick={handleRevoke}
                disabled={!activeGrantId || revoking}
                className="px-3 py-2 rounded-md text-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {revoking ? 'Revoking...' : 'Revoke share'}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareValue}
                className="flex-1 px-3 py-2 text-xs font-mono bg-secondary border border-border rounded-md text-foreground"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                placeholder="No secure link yet"
              />
              <button
                onClick={handleCopy}
                disabled={!shareValue}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-primary text-white hover:bg-primary-hover'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={handleCopyLegacy}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Copy legacy ID
              </button>
              {expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(expiresAt).toLocaleTimeString()}
                </p>
              )}
            </div>

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            {statusMessage && !error && (
              <p className="text-xs text-green-400 mt-2">{statusMessage}</p>
            )}

            <p className="text-xs text-muted-foreground mt-2">
              Routed via Cloudflare. End-to-end content access is controlled by xNet encryption and
              permissions.
            </p>

            <details className="mt-3 rounded-md border border-border p-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">Advanced</summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>Status: {tunnelStatus?.health ?? 'stopped'}</p>
                <p>Mode: {formatTunnelModeLabel(tunnelStatus?.mode)}</p>
                <p>Endpoint: {tunnelStatus?.endpoint ?? 'not available'}</p>
                {tunnelStatus?.message && <p>Message: {tunnelStatus.message}</p>}
              </div>
            </details>

            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> Both users must be online for real-time sync. Changes sync
                automatically via P2P.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function toHttpUrl(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')
}

function formatTunnelModeLabel(mode: 'temporary' | 'persistent' | null | undefined): string {
  if (mode === 'temporary') {
    return 'temporary (test-only quick tunnel)'
  }
  if (mode === 'persistent') {
    return 'persistent (production-safe)'
  }
  return 'n/a'
}
