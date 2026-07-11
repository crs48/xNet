/**
 * AddSharedDialog - Open a share link that was sent to you.
 *
 * Paste a share URL (https://<hub>/s/<linkId>#s=… or xnet://share?…). The
 * link is claimed against its hub, which grants this identity access; the
 * document then syncs and appears in the sidebar permanently.
 */

import { useNavigate } from '@tanstack/react-router'
import { SpaceMembershipSchema, spaceMembershipId } from '@xnetjs/data'
import { useIdentity, useMutate, useXNet, workspaceShareRoom } from '@xnetjs/react'
import { Link, X } from 'lucide-react'
import { useState } from 'react'
import {
  claimErrorText,
  claimShareLink,
  docRouteFor,
  parseShareUrl,
  spaceRoleFromShareRole,
  type ShareClaimResult
} from '../lib/share-links'

interface AddSharedDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function AddSharedDialog({ isOpen, onClose }: AddSharedDialogProps) {
  const navigate = useNavigate()
  const { getHubAuthToken, syncManager } = useXNet()
  const { create } = useMutate()
  const { did } = useIdentity()
  const [shareUrl, setShareUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  if (!isOpen) return null

  const recordSpaceMembership = async (result: ShareClaimResult): Promise<void> => {
    // A claimed Space invite grants hub access; also write a membership edge so
    // the new member appears in the roster and the schema cascade resolves
    // (exploration 0181). The edge id is deterministic, so re-claims upsert.
    if (result.docType !== 'space' || !did) return
    const member = did as `did:key:${string}`
    await create(
      SpaceMembershipSchema,
      {
        space: result.resource,
        member,
        role: spaceRoleFromShareRole(result.role),
        addedBy: member,
        addedAt: Date.now()
      },
      spaceMembershipId(result.resource, did)
    )
  }

  const openClaimedDoc = (result: ShareClaimResult): void => {
    // A workspace has no viewer route to mount its share-room subscription;
    // pull it so the bench materializes in the switcher (0298 Phase 2).
    if (result.docType === 'workspace' && syncManager) {
      syncManager.subscribeShareRoom(workspaceShareRoom(result.resource))
    }
    const route = docRouteFor(result.docType, result.resource)
    void navigate({ to: route.to, params: route.params } as never)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const parsed = parseShareUrl(shareUrl)
    if (!parsed) {
      setError('Paste a full share link, like https://hub.xnet.fyi/s/abc123#s=…')
      return
    }
    if (!getHubAuthToken) {
      setError('Hub authentication is not available')
      return
    }

    setClaiming(true)
    setError(null)
    try {
      const token = await getHubAuthToken()
      const result = await claimShareLink(parsed, token)
      await recordSpaceMembership(result)
      openClaimedDoc(result)
      setShareUrl('')
      onClose()
    } catch (err) {
      setError(claimErrorText(err))
    } finally {
      setClaiming(false)
    }
  }

  const handleClose = () => {
    setShareUrl('')
    setError(null)
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
            <h2 className="text-sm font-medium">Open Share Link</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={(e) => void handleSubmit(e)} className="p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Paste a share link that was sent to you. Claiming it gives this device access and the
            document syncs automatically.
          </p>

          <div className="mb-4">
            <label className="block text-xs text-muted-foreground mb-1.5">Share link</label>
            <input
              type="text"
              value={shareUrl}
              onChange={(e) => {
                setShareUrl(e.target.value)
                setError(null)
              }}
              placeholder="https://hub.xnet.fyi/s/abc123#s=…"
              className="w-full px-3 py-2 text-sm font-mono bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
              autoFocus
            />
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
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
              disabled={claiming}
              className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {claiming ? 'Claiming…' : 'Open'}
            </button>
          </div>
        </form>

        {/* Footer note */}
        <div className="px-4 py-3 bg-secondary/50 border-t border-border rounded-b-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Share links replace the old document-ID sharing. Ask for a new
            link if someone sent you a bare <code>page:…</code> ID.
          </p>
        </div>
      </div>
    </>
  )
}
