/**
 * ShareButton - Copy document ID for sharing
 *
 * Works with any document type (Page, Database, Canvas).
 * Future: Could be extended to share specific rows/blocks.
 */

import type { DID, GrantInput } from '@xnet/data'
import { useXNet } from '@xnet/react'
import { Share2, Check, Copy } from 'lucide-react'
import React, { useState } from 'react'
import { buildUniversalShareUrl, type ShareDocType } from '../lib/share-payload'

interface ShareButtonProps {
  docId: string
  docType: 'page' | 'database' | 'canvas'
}

export function ShareButton({ docId, docType }: ShareButtonProps) {
  const { authorDID, nodeStore } = useXNet()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareValue, setShareValue] = useState<string>(`${docType}:${docId}`)
  const [activeGrantId, setActiveGrantId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)

  const handleShareSecurely = async () => {
    try {
      setError(null)

      const fallbackShare = `${docType}:${docId}`
      if (!nodeStore?.auth || !authorDID) {
        setShareValue(fallbackShare)
        await navigator.clipboard.writeText(fallbackShare)
        setError('Auth is unavailable. Copied legacy share ID instead.')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      }

      const grant = await nodeStore.auth.grant({
        to: authorDID as DID,
        actions: ['read', 'write'],
        resource: docId,
        expiresIn: 30 * 60 * 1000
      } satisfies GrantInput)

      const endpoint = import.meta.env.VITE_HUB_URL || 'ws://localhost:4444'
      const payload = {
        v: 2,
        resource: docId,
        docType: docType as ShareDocType,
        endpoint,
        token: grant.ucanToken ?? grant.id,
        exp: grant.expiresAt || Date.now() + 30 * 60 * 1000,
        transportHints: {
          ws: true,
          webrtc: false
        }
      } as const

      const universalUrl = buildUniversalShareUrl(payload)

      setShareValue(universalUrl)
      setActiveGrantId(grant.id)
      await navigator.clipboard.writeText(universalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to create secure share link:', err)
      setError(message)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareValue)
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
              Generate a secure share link with a short-lived grant. Guests can paste it in "Open
              Shared" to access this {typeLabel.toLowerCase()}.
            </p>

            <div className="flex gap-2 mb-2">
              <button
                onClick={handleShareSecurely}
                className="px-3 py-2 rounded-md text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                Share securely
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
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-primary text-white hover:bg-primary-hover'
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

            <p className="text-xs text-muted-foreground mt-2">
              Routed via Cloudflare. End-to-end content access is controlled by xNet encryption and
              permissions.
            </p>

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
