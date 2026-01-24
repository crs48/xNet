/**
 * ShareButton - Copy document ID for sharing
 *
 * Works with any document type (Page, Database, Canvas).
 * Future: Could be extended to share specific rows/blocks.
 */

import React, { useState } from 'react'
import { Share2, Check, Copy } from 'lucide-react'

interface ShareButtonProps {
  docId: string
  docType: 'page' | 'database' | 'canvas'
}

export function ShareButton({ docId, docType }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      // Encode type with the docId so peers open it correctly
      await navigator.clipboard.writeText(`${docType}:${docId}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
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
              Copy this ID and share it with others. They can use "Open Shared" to access this{' '}
              {typeLabel.toLowerCase()}.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${docType}:${docId}`}
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
