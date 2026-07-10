/**
 * ShareDialog - URL-based sharing and access control (exploration 0169).
 *
 * Links tab: create / list / disable / delete share links for a doc.
 * People tab: everyone with a grant on the doc, with role and provenance.
 */

import { useXNet } from '@xnetjs/react'
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useRef, useState } from 'react'
import { nodeIdFromHref } from '../comms/link-composer'
import { useLinkTargets } from '../hooks/useLinkTargets'
import {
  roleFromGrantActions,
  useShareGrants,
  useShareLinks,
  type CreateLinkOptions,
  type ShareDocType,
  type ShareRole
} from '../hooks/useShareLinks'
import { isPrivateHubHost } from '../lib/share-links'
import { PermissionMatrixPanel } from './PermissionMatrixPanel'

interface ShareDialogProps {
  docId: string
  docType: ShareDocType
  isOpen: boolean
  onClose: () => void
}

const ROLE_LABELS: Record<ShareRole, string> = {
  read: 'Can view',
  comment: 'Can comment',
  write: 'Can edit'
}

const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: 0 },
  { label: '1 day', value: 24 * 60 * 60 * 1000 },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', value: 30 * 24 * 60 * 60 * 1000 }
] as const

const MAX_USES_OPTIONS = [
  { label: 'Unlimited uses', value: 0 },
  { label: '1 use', value: 1 },
  { label: '5 uses', value: 5 },
  { label: '25 uses', value: 25 }
] as const

const shortDid = (did: string): string =>
  did.length > 24 ? `${did.slice(0, 14)}…${did.slice(-6)}` : did

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function RoleChip({ role }: { role: ShareRole }): JSX.Element {
  const tones: Record<ShareRole, string> = {
    read: 'bg-secondary text-muted-foreground',
    comment: 'bg-amber-500/15 text-amber-500',
    write: 'bg-primary/15 text-primary'
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tones[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  )
}

function CopyButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy link"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        copied ? 'bg-green-500/20 text-green-400' : 'bg-primary text-white hover:bg-primary/90'
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ShareDialog({
  docId,
  docType,
  isOpen,
  onClose
}: ShareDialogProps): JSX.Element | null {
  // The body (and its data-fetching hooks) must only mount while the
  // dialog is open — otherwise every doc page fires hub requests just by
  // rendering its Share button.
  if (!isOpen) return null
  return <ShareDialogBody docId={docId} docType={docType} onClose={onClose} />
}

function ShareDialogBody({
  docId,
  docType,
  onClose
}: Omit<ShareDialogProps, 'isOpen'>): JSX.Element {
  const [tab, setTab] = useState<'links' | 'people' | 'permissions'>('links')
  const [role, setRole] = useState<ShareRole>('read')
  const [label, setLabel] = useState('')
  const [expiresIn, setExpiresIn] = useState<number>(0)
  const [maxUses, setMaxUses] = useState<number>(0)
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  // In-person / P2P handoff: render the same URL as a QR code so a phone
  // camera can claim without any messaging channel.
  const toggleQr = async (url: string): Promise<void> => {
    if (qrDataUrl) {
      setQrDataUrl(null)
      return
    }
    setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 192 }))
  }

  const { authorDID } = useXNet()
  const {
    links,
    loading: linksLoading,
    error: linksError,
    hubHttpUrl,
    ready,
    createLink,
    setLinkDisabled,
    deleteLink,
    setLinkPreview
  } = useShareLinks(docId, docType)
  const { grants, loading: grantsLoading, error: grantsError, revokeGrant } = useShareGrants(docId)

  // The doc's current title, for the link-preview snapshot (0295). The doc
  // being shared is open right now, so the recency-bounded target list has it.
  const { linkTargets } = useLinkTargets()
  const docTitle = useMemo(
    () => linkTargets.find((target) => nodeIdFromHref(target.href) === docId)?.title ?? null,
    [linkTargets, docId]
  )
  const [publishPreview, setPublishPreview] = useState(true)

  // Re-publish stale snapshots so renames propagate to pasted cards. One
  // attempt per link per dialog mount — a failing hub must not loop.
  const republished = useRef(new Set<string>())
  useEffect(() => {
    if (!docTitle) return
    for (const link of links) {
      if (
        link.preview &&
        !link.disabled &&
        link.preview.title !== docTitle &&
        !republished.current.has(link.linkId)
      ) {
        republished.current.add(link.linkId)
        void setLinkPreview(link.linkId, docTitle).catch(() => undefined)
      }
    }
  }, [links, docTitle, setLinkPreview])

  const privateHub = useMemo(
    () => (hubHttpUrl ? isPrivateHubHost(hubHttpUrl) : false),
    [hubHttpUrl]
  )
  const activeGrants = useMemo(() => grants.filter((grant) => grant.revokedAt === 0), [grants])

  const handleCreate = async (): Promise<void> => {
    setCreating(true)
    setActionError(null)
    try {
      const options: CreateLinkOptions = { role }
      if (label.trim()) options.label = label.trim()
      if (expiresIn > 0) options.expiresAt = Date.now() + expiresIn
      if (maxUses > 0) options.maxUses = maxUses
      if (publishPreview && docTitle) options.previewTitle = docTitle
      const created = await createLink(options)
      setFreshUrl(created.url ?? null)
      setQrDataUrl(null)
      setLabel('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[calc(100vw-2rem)] bg-background border border-border rounded-lg shadow-xl z-50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Share</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-border px-2">
          <button
            type="button"
            onClick={() => setTab('links')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
              tab === 'links'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link2 size={13} /> Links
          </button>
          <button
            type="button"
            onClick={() => setTab('people')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
              tab === 'people'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users size={13} /> People{activeGrants.length > 0 ? ` (${activeGrants.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setTab('permissions')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
              tab === 'permissions'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck size={13} /> Permissions
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {!ready && tab !== 'permissions' && (
            <p className="text-xs text-muted-foreground">Connect to a hub to create share links.</p>
          )}

          {ready && privateHub && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-md bg-amber-500/10 text-amber-500 text-xs">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                Your hub ({hubHttpUrl}) is not publicly reachable — these links only work on your
                machine or local network.
              </span>
            </div>
          )}

          {actionError && <p className="text-xs text-red-400 mb-3">{actionError}</p>}

          {ready && tab === 'links' && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as ShareRole)}
                  className="px-2 py-1.5 text-xs bg-secondary border border-border rounded-md text-foreground"
                >
                  {(Object.keys(ROLE_LABELS) as ShareRole[]).map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value))}
                  className="px-2 py-1.5 text-xs bg-secondary border border-border rounded-md text-foreground"
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="px-2 py-1.5 text-xs bg-secondary border border-border rounded-md text-foreground"
                >
                  {MAX_USES_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="flex-1 min-w-[100px] px-2 py-1.5 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className="px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating…' : 'New link'}
                </button>
              </div>

              <label
                className={`flex items-center gap-2 mb-3 text-[11px] ${
                  docTitle ? 'text-muted-foreground' : 'text-muted-foreground/50'
                }`}
                title={
                  docTitle
                    ? 'Anyone with the link URL can see this title before opening it'
                    : 'Title unavailable for this document'
                }
              >
                <input
                  type="checkbox"
                  checked={publishPreview && Boolean(docTitle)}
                  disabled={!docTitle}
                  onChange={(e) => setPublishPreview(e.target.checked)}
                  className="rounded border-border"
                />
                Show title in link previews{docTitle ? ` (“${docTitle}”)` : ''}
              </label>

              {freshUrl && (
                <div className="mb-3 p-2 rounded-md border border-primary/40 bg-primary/5">
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Link created — copy it now. The secret is only stored on this device.
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      readOnly
                      value={freshUrl}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 px-2 py-1 text-[11px] font-mono bg-secondary border border-border rounded text-foreground"
                    />
                    <CopyButton value={freshUrl} />
                    <button
                      type="button"
                      title={qrDataUrl ? 'Hide QR code' : 'Show QR code'}
                      onClick={() => void toggleQr(freshUrl)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                        qrDataUrl
                          ? 'bg-primary text-white'
                          : 'border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <QrCode size={12} /> QR
                    </button>
                  </div>
                  {qrDataUrl && (
                    <div className="mt-2 flex justify-center">
                      <img
                        src={qrDataUrl}
                        alt="Share link QR code"
                        className="rounded bg-white p-1"
                        width={192}
                        height={192}
                      />
                    </div>
                  )}
                </div>
              )}

              {linksError && <p className="text-xs text-red-400 mb-2">{linksError}</p>}
              {linksLoading && links.length === 0 && (
                <p className="text-xs text-muted-foreground">Loading links…</p>
              )}
              {!linksLoading && links.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No share links yet. Anyone who opens a link gets {ROLE_LABELS.read.toLowerCase()},
                  comment, or edit access depending on the link's role.
                </p>
              )}

              <ul className="space-y-2">
                {links.map((link) => (
                  <li
                    key={link.linkId}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-md border border-border ${
                      link.disabled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs truncate">
                          {link.label || `Link ${link.linkId.slice(0, 6)}`}
                        </span>
                        <RoleChip role={link.role} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {link.useCount}
                        {link.maxUses > 0 ? `/${link.maxUses}` : ''} use
                        {link.useCount === 1 ? '' : 's'}
                        {link.expiresAt > 0 ? ` · expires ${formatDate(link.expiresAt)}` : ''}
                        {link.disabled ? ' · disabled' : ''}
                      </p>
                    </div>
                    {link.url && !link.disabled && <CopyButton value={link.url} />}
                    <button
                      type="button"
                      title={
                        link.preview
                          ? 'Preview on — pasted links show the title. Click to hide.'
                          : 'Preview off — pasted links stay bare URLs. Click to publish the title.'
                      }
                      disabled={!link.preview && !docTitle}
                      onClick={() =>
                        void runAction(() =>
                          setLinkPreview(link.linkId, link.preview ? null : docTitle)
                        )
                      }
                      className={`p-1 transition-colors ${
                        link.preview
                          ? 'text-primary hover:text-muted-foreground'
                          : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                      }`}
                    >
                      {link.preview ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      type="button"
                      title={link.disabled ? 'Enable link' : 'Disable link'}
                      onClick={() =>
                        void runAction(() => setLinkDisabled(link.linkId, !link.disabled))
                      }
                      className={`relative w-8 h-4.5 h-[18px] rounded-full transition-colors ${
                        link.disabled ? 'bg-secondary' : 'bg-primary'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                          link.disabled ? 'left-0.5' : 'left-0.5 translate-x-3.5'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      title="Delete link"
                      onClick={() => void runAction(() => deleteLink(link.linkId))}
                      className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {ready && tab === 'people' && (
            <>
              {grantsError && <p className="text-xs text-red-400 mb-2">{grantsError}</p>}
              {grantsLoading && activeGrants.length === 0 && (
                <p className="text-xs text-muted-foreground">Loading people…</p>
              )}
              {!grantsLoading && activeGrants.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nobody has claimed a share link for this {docType} yet.
                </p>
              )}
              <ul className="space-y-2">
                {activeGrants.map((grant) => (
                  <li
                    key={grant.grantId}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono truncate">
                          {shortDid(grant.granteeDid)}
                          {grant.granteeDid === authorDID ? ' (you)' : ''}
                        </span>
                        <RoleChip role={roleFromGrantActions(grant.actions)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        joined {formatDate(grant.createdAt)}
                        {grant.viaLinkLabel
                          ? ` · via “${grant.viaLinkLabel}”`
                          : grant.viaLinkId
                            ? ` · via link ${grant.viaLinkId.slice(0, 6)}`
                            : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runAction(() => revokeGrant(grant.grantId))}
                      className="px-2 py-1 text-[11px] text-muted-foreground hover:text-red-400 border border-border rounded transition-colors"
                    >
                      Remove access
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'permissions' && <PermissionMatrixPanel docId={docId} />}
        </div>

        <div className="px-4 py-3 bg-secondary/50 border-t border-border rounded-b-lg">
          <p className="text-[11px] text-muted-foreground">
            Disabling a link stops new people from joining but keeps existing access — remove people
            from the People tab.
          </p>
        </div>
      </div>
    </>
  )
}
