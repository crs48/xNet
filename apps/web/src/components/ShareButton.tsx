/**
 * ShareButton - opens the URL-based ShareDialog (exploration 0169).
 *
 * Works with any document type (Page, Database, Canvas, Dashboard, View).
 */

import type { ShareDocType } from '../hooks/useShareLinks'
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { ShareDialog } from './ShareDialog'

interface ShareButtonProps {
  docId: string
  docType: ShareDocType
}

export function ShareButton({ docId, docType }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 py-1 text-xs text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
        title="Share"
      >
        <Share2 size={13} strokeWidth={1.5} />
        <span>Share</span>
      </button>

      <ShareDialog
        docId={docId}
        docType={docType}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  )
}
