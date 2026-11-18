import type { DesktopOnboardingSnapshot } from '../../shared/onboarding'
import type { ReactNode } from 'react'
import { ProfileSchema, profileNodeId } from '@xnetjs/data'
import { useDataBridge, useIdentity } from '@xnetjs/react'
import { ArrowRight, Check, Link, Loader2, MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DesktopSocialIdentity } from './DesktopSocialIdentity'

const primary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40'
const secondary =
  'rounded-xl border border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted disabled:opacity-40'
const field =
  'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'
const message = (cause: unknown) =>
  (cause instanceof Error ? cause.message : String(cause)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ''
  )

/** Keep native invitation capabilities in main; the UI sees only destination metadata. */
export function DesktopEntry({
  children,
  onOpenSettings,
  onOpenConversation
}: {
  children: ReactNode
  onOpenSettings: () => void
  onOpenConversation: (channel: string) => void
}) {
  const { did } = useIdentity()
  const bridge = useDataBridge()
  const [snapshot, setSnapshot] = useState<DesktopOnboardingSnapshot>()
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [snoozed, setSnoozed] = useState<string[]>([])
  const [selected, setSelected] = useState<string>()
  const [requested, setRequested] = useState<{ name: string; channel: string }>()
  const [now, setNow] = useState(Date.now)
  const title = useRef<HTMLHeadingElement>(null)
  const revision = useRef({ value: 0 })
  const refresh = useCallback(async () => {
    const current = ++revision.current.value
    try {
      const next = await window.xnetOnboarding.snapshot()
      if (revision.current.value === current) {
        setSnapshot(next)
        setLoadError('')
      }
    } catch (cause) {
      if (revision.current.value === current) setLoadError(message(cause))
    }
  }, [])
  useEffect(() => {
    const tracker = revision.current
    const unsubscribe = window.xnetOnboarding.subscribe(() => void refresh())
    void refresh()
    return () => {
      ++tracker.value
      unsubscribe()
    }
  }, [refresh])
  useEffect(() => {
    if (snapshot?.complete || !bridge?.get || !did) return
    let active = true
    void bridge.get(profileNodeId(did)).then(
      (profile) => {
        if (active && typeof profile?.properties.displayName === 'string')
          setName(profile.properties.displayName)
      },
      (cause: unknown) => {
        if (active) setError(message(cause))
      }
    )
    return () => {
      active = false
    }
  }, [bridge, did, snapshot?.complete])
  const verifiedName = snapshot?.socialIdentity?.displayName || snapshot?.socialIdentity?.handle
  const verifiedAt = snapshot?.socialIdentity?.verifiedAt
  useEffect(() => {
    if (!snapshot?.complete && verifiedName) setName(verifiedName)
  }, [snapshot?.complete, verifiedName, verifiedAt])
  const waiting = snapshot?.invitations.filter((entry) => !snoozed.includes(entry.id)) ?? []
  const invitation = waiting.find((entry) => entry.id === selected) ?? waiting[0]
  const screen = !snapshot
    ? 'loading'
    : !snapshot.complete
      ? 'profile'
      : requested
        ? 'requested'
        : invitation
          ? 'invitation'
          : 'app'
  useEffect(() => {
    title.current?.focus()
  }, [screen, invitation?.id])
  const invitationId = invitation?.id
  useEffect(() => {
    if (!invitationId) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [invitationId])
  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }
  const saveLink = async () => {
    if (!link.trim()) return
    await window.xnetOnboarding.saveInvitation(link.trim())
    setLink('')
    setShowPaste(false)
    await refresh()
  }
  const saveProfile = async () => {
    const displayName = name.trim()
    if (!displayName || displayName.length > 120)
      throw new Error('Choose a name of 1–120 characters.')
    if (!bridge?.get || !did)
      throw new Error('Your local database is still opening. Please try again.')
    await saveLink()
    const id = profileNodeId(did)
    const existing = await bridge.get(id)
    if (existing) await bridge.update(id, { displayName })
    else await bridge.create(ProfileSchema, { did: did as `did:key:${string}`, displayName }, id)
    await window.xnetPeers.setDisplayName(displayName)
    // The profile must reach the database before setup can be marked complete.
    await window.xnetOnboarding.complete()
    await refresh()
  }
  if (screen === 'app' && !loadError)
    return (
      <>
        {children}
        {!!snapshot?.invitations.length && (
          <button
            className={`${secondary} fixed bottom-5 right-5 z-40 bg-background shadow-lg`}
            onClick={() => {
              setSnoozed([])
              setError('')
            }}
          >
            Review saved invitations ({snapshot.invitations.length})
          </button>
        )}
      </>
    )
  const expired = invitation && invitation.expires <= now
  return (
    <main className="flex h-screen flex-col overflow-y-auto bg-background text-foreground">
      <div className="h-10 shrink-0 titlebar-drag" />
      <div className="m-auto w-full max-w-lg px-8 py-10 motion-safe:animate-in motion-safe:fade-in">
        <div className="mb-12 flex items-center gap-3" aria-label="xNet">
          <span aria-hidden="true" className="community-brand-wordmark h-7 w-24" />
        </div>
        {loadError ? (
          <>
            <h1 ref={title} tabIndex={-1} className="text-2xl font-semibold outline-none">
              Your setup couldn’t be opened
            </h1>
            <p role="alert" className="mt-4 text-sm leading-6">
              {loadError}
            </p>
            <div className="mt-6 flex gap-3">
              <button className={primary} onClick={() => void refresh()}>
                Try again
              </button>
              <button className={secondary} onClick={onOpenSettings}>
                Recovery settings
              </button>
            </div>
          </>
        ) : screen === 'loading' ? (
          <p role="status" className="flex items-center gap-3 text-sm">
            <Loader2 size={18} className="motion-safe:animate-spin" /> Opening your local workspace…
          </p>
        ) : screen === 'profile' ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {invitation ? 'Your invitation is saved · Step 1 of 2' : 'Make yourself at home'}
            </p>
            <h1
              ref={title}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight outline-none"
            >
              What should we call you?
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Choose a name for your xNet profile. You can change it later.
            </p>
            {invitation && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border p-4">
                <MessageCircle size={20} />
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">
                    You’re headed to {invitation.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {invitation.access === 'public'
                      ? 'Public group'
                      : invitation.kind === 'group'
                        ? 'Private group'
                        : 'Private chat'}{' '}
                    · review before connecting
                  </p>
                </div>
              </div>
            )}
            <div className="mt-6">
              <DesktopSocialIdentity />
            </div>
            <form
              className="mt-8 space-y-5"
              onSubmit={(event) => {
                event.preventDefault()
                void act(saveProfile)
              }}
            >
              <div>
                <label htmlFor="onboarding-name" className="mb-2 block text-sm font-medium">
                  Your name
                </label>
                <input
                  id="onboarding-name"
                  autoComplete="nickname"
                  className={field}
                  value={name}
                  maxLength={120}
                  placeholder="e.g. Maya"
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <button
                className={`${primary} w-full`}
                disabled={busy || !name.trim() || !bridge || !did}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="motion-safe:animate-spin" /> Saving your profile…
                  </>
                ) : (
                  <>
                    {invitation || link.trim() ? 'Continue to invitation' : 'Start using xNet'}{' '}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              {snapshot?.identityStorage === 'secure'
                ? 'Your identity key is protected by this computer’s system key store. Keep a recovery copy before moving to another device.'
                : snapshot?.identityStorage === 'test'
                  ? 'Development profile · uses a test identity.'
                  : 'This computer has no secure key store available. Your identity key is saved locally without encryption.'}
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              You can also continue with just a name. Social sign-in is optional.
            </p>
            {!invitation && (
              <button
                className="mt-6 inline-flex items-center gap-2 text-sm underline underline-offset-4"
                onClick={() => setShowPaste(!showPaste)}
                disabled={busy}
              >
                <Link size={14} /> I have an invitation
              </button>
            )}
          </>
        ) : screen === 'requested' ? (
          <>
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Check size={24} />
            </div>
            <h1 ref={title} tabIndex={-1} className="text-2xl font-semibold outline-none">
              Your request is ready
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Your request to {requested?.name} is saved on this device. Keep xNet open so it can
              reach your friend. They’ll review it when their app is open.
            </p>
            <button
              className={`${primary} mt-8 w-full`}
              onClick={() => {
                if (requested) onOpenConversation(requested.channel)
                setRequested(undefined)
                setSnoozed(snapshot?.invitations.map((entry) => entry.id) ?? [])
              }}
            >
              Go to messages <ArrowRight size={16} />
            </button>
            <p className="mt-4 text-xs text-muted-foreground">
              Follow its status in “Connect a friend”.
            </p>
          </>
        ) : invitation ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {invitation.access === 'public'
                ? 'Public group'
                : invitation.kind === 'group'
                  ? 'Private group'
                  : 'Private chat'}{' '}
              · {expired ? 'Invitation expired' : 'Invitation saved on this device'}
            </p>
            <h1
              ref={title}
              tabIndex={-1}
              className="break-words text-3xl font-semibold tracking-tight outline-none"
            >
              {invitation.name}
            </h1>
            {waiting.length > 1 && (
              <nav aria-label="Saved invitations" className="mt-4 flex flex-wrap gap-2">
                {waiting.map((entry) => (
                  <button
                    key={entry.id}
                    className={secondary}
                    aria-pressed={entry.id === invitation.id}
                    disabled={busy}
                    onClick={() => {
                      setSelected(entry.id)
                      setError('')
                    }}
                  >
                    {entry.name}
                  </button>
                ))}
              </nav>
            )}
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              {expired
                ? 'Ask your friend for a fresh link. Your profile is ready, so you won’t need to set it up again.'
                : invitation.access === 'public'
                  ? 'View this public group without joining. Join when you want to post. The host must be online to share its history.'
                  : invitation.kind === 'group'
                    ? 'Request to join this private group. Its host approves each member and must be online to deliver messages. Once approved, you can read history from current members. Other conversations remain private.'
                    : 'Send a request to your friend. The conversation becomes available after they accept. You’ll both need xNet open to exchange messages.'}
            </p>
            <details className="mt-5 rounded-xl border border-border p-4 text-xs leading-5">
              <summary className="cursor-pointer font-medium">
                Check who you’re connecting to
              </summary>
              <p className="mt-3">
                Confirm this identity with your friend before connecting. A conversation name alone
                is not proof of who sent the link.
              </p>
              <code className="mt-2 block break-all">{invitation.did}</code>
            </details>
            {!expired && (
              <>
                <p className="mt-5 text-xs leading-5 text-muted-foreground">
                  Connecting shares your device identity and network address with this peer. It does
                  not share other conversations or give access to your agents.
                </p>
                <button
                  className={`${primary} mt-6 w-full`}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const status = await window.xnetOnboarding.requestConnection(invitation.id)
                      setShowPaste(false)
                      setLink('')
                      if (status === 'approved') onOpenConversation(invitation.channel)
                      else setRequested({ name: invitation.name, channel: invitation.channel })
                      await refresh()
                    })
                  }
                >
                  {busy ? (
                    <>
                      <Loader2 size={16} className="motion-safe:animate-spin" /> Preparing request…
                    </>
                  ) : (
                    <>
                      {invitation.access === 'public' ? 'View group' : 'Request to connect'}{' '}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </>
            )}
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <button
                className={secondary}
                disabled={busy}
                onClick={() => {
                  setSnoozed(snapshot?.invitations.map((entry) => entry.id) ?? [])
                  setError('')
                }}
              >
                Keep for later
              </button>
              <button
                className="px-3 py-2 text-sm text-muted-foreground underline underline-offset-4"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await window.xnetOnboarding.dismissInvitation(invitation.id)
                    await refresh()
                  })
                }
              >
                Remove invitation
              </button>
            </div>
            <button
              className="mt-6 inline-flex items-center gap-2 text-sm underline underline-offset-4"
              disabled={busy}
              onClick={() => setShowPaste(!showPaste)}
            >
              <Link size={14} /> Use another invitation
            </button>
          </>
        ) : null}
        {showPaste && (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void act(saveLink)
            }}
          >
            <label htmlFor="onboarding-invite" className="block text-sm">
              Invitation link
            </label>
            <textarea
              id="onboarding-invite"
              className={`${field} h-24 resize-none`}
              placeholder="Paste xnet://peer…"
              value={link}
              maxLength={12000}
              disabled={busy}
              onChange={(event) => setLink(event.target.value)}
            />
            <button className={secondary} disabled={busy || !link.trim()}>
              Save invitation
            </button>
          </form>
        )}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-destructive/30 p-4 text-sm leading-6 text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
