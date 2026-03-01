/**
 * AddSharedDialog - Add a shared document to your local database
 *
 * User pastes a document ID and it gets added to their local store.
 * The document then syncs via P2P and appears in their sidebar permanently.
 */

import { Link, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { parseShareInput } from '../lib/share-payload'

export interface AddSharedInput {
  docType: 'page' | 'database' | 'canvas'
  docId: string
  share?: {
    endpoint: string
    token: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }
}

interface AddSharedDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (input: AddSharedInput) => Promise<void> | void
  initialValue?: string
}

export function AddSharedDialog({ isOpen, onClose, onAdd, initialValue }: AddSharedDialogProps) {
  const [docId, setDocId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [securityNotice, setSecurityNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !initialValue) {
      return
    }
    setDocId(initialValue)
    setError(null)
    setSecurityNotice(null)
  }, [initialValue, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const parsed = parseShareInput(docId)
      if (parsed.kind === 'v2' && parsed.securityWarnings && parsed.securityWarnings.length > 0) {
        const notice = parsed.securityWarnings.join(' ')
        setSecurityNotice(notice)
        console.warn('[AddSharedDialog] Secure-share ICE policy warning:', notice)
      } else {
        setSecurityNotice(null)
      }

      if (parsed.kind === 'legacy') {
        await onAdd({
          docType: parsed.docType,
          docId: parsed.docId
        })
      } else if (parsed.kind === 'handle') {
        const hubHttpUrl = resolveHubHttpUrl()
        if (!hubHttpUrl) {
          throw new Error('Hub URL is not configured for secure share redemption')
        }

        const redeemResponse = await fetch(`${hubHttpUrl}/shares/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: parsed.handle })
        })

        const redeemed = (await redeemResponse.json().catch(() => null)) as
          | {
              endpoint: string
              token: string
              resource: string
              docType: 'page' | 'database' | 'canvas'
              exp: number
            }
          | { error?: string }
          | null

        if (!redeemResponse.ok || !redeemed || !('endpoint' in redeemed)) {
          const message = redeemed && 'error' in redeemed ? redeemed.error : null
          throw new Error(message ?? 'Secure share link could not be redeemed')
        }

        if (!redeemed.token || redeemed.exp <= Date.now()) {
          throw new Error('Secure share session is expired')
        }

        await onAdd({
          docType: redeemed.docType,
          docId: redeemed.resource,
          share: {
            endpoint: redeemed.endpoint,
            token: redeemed.token,
            transport: 'ws'
          }
        })
      } else {
        const hints = parsed.payload.transportHints
        if (!parsed.payload.token) {
          throw new Error('Secure share payload is missing token material')
        }
        await onAdd({
          docType: parsed.payload.docType,
          docId: parsed.payload.resource,
          share: {
            endpoint: parsed.payload.endpoint,
            token: parsed.payload.token,
            transport: hints?.webrtc ? 'auto' : 'ws',
            iceServers: hints?.iceServers
          }
        })
      }

      setDocId('')
      setError(null)
      setSecurityNotice(null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setDocId(text)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleClose = () => {
    setDocId('')
    setError(null)
    setSecurityNotice(null)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={handleClose} />

      {/* Dialog */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-background border border-border rounded-lg shadow-xl z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Link size={16} className="text-primary" />
            <h2 className="text-sm font-medium">Add Shared Document</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Paste a secure share link, payload token, or legacy document ID. The document will be
            added to your library and sync automatically.
          </p>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs text-muted-foreground">Share link or payload</label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="text-xs text-primary hover:underline"
              >
                Paste from clipboard
              </button>
            </div>
            <input
              type="text"
              value={docId}
              onChange={(e) => {
                const nextValue = e.target.value
                setDocId(nextValue)
                setError(null)
                try {
                  const parsed = parseShareInput(nextValue)
                  if (
                    parsed.kind === 'v2' &&
                    parsed.securityWarnings &&
                    parsed.securityWarnings.length > 0
                  ) {
                    setSecurityNotice(parsed.securityWarnings.join(' '))
                  } else {
                    setSecurityNotice(null)
                  }
                } catch {
                  setSecurityNotice(null)
                }
              }}
              placeholder="https://xnet.fyi/app/share?payload=..."
              className="w-full px-3 py-2 text-sm font-mono bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
              autoFocus
            />
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            {securityNotice && !error && (
              <p className="text-xs text-amber-500 mt-1.5">{securityNotice}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover transition-colors"
            >
              Add to Library
            </button>
          </div>
        </form>

        {/* Footer note */}
        <div className="px-4 py-3 bg-secondary/50 border-t border-border rounded-b-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Both you and the document owner need to be online for the initial
            sync. After that, changes sync whenever you're both online.
          </p>
        </div>
      </div>
    </>
  )
}

function resolveHubHttpUrl(): string | null {
  const configured = import.meta.env.VITE_HUB_URL as string | undefined
  if (!configured) {
    return null
  }
  return configured.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')
}
