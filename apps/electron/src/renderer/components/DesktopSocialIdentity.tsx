import type { DesktopOnboardingSnapshot } from '../../shared/onboarding'
import { ProfileSchema, profileNodeId } from '@xnetjs/data'
import { useDataBridge, useIdentity } from '@xnetjs/react'
import { Check, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

/** Native identity-only OAuth. No provider credentials enter the renderer. */
export function DesktopSocialIdentity() {
  const [snapshot, setSnapshot] = useState<DesktopOnboardingSnapshot>()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const { did } = useIdentity()
  const bridge = useDataBridge()
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await window.xnetOnboarding.snapshot())
    } catch {
      setError('Your connected accounts could not be loaded. Try reopening your profile.')
    }
  }, [])
  useEffect(() => {
    const unsubscribe = window.xnetOnboarding.subscribe(() => void refresh())
    void refresh()
    return unsubscribe
  }, [refresh])
  const social = snapshot?.socialIdentity
  const socialSubject = social?.subject
  const socialHandle = social?.handle
  const socialName = social?.displayName
  useEffect(() => {
    if (!socialSubject || !socialHandle || !bridge?.get || !did) return
    let active = true
    void (async () => {
      const id = profileNodeId(did)
      const existing = await bridge.get!(id)
      const fields = { atprotoDid: socialSubject, atprotoHandle: socialHandle }
      if (existing) {
        if (
          existing.properties.atprotoDid !== fields.atprotoDid ||
          existing.properties.atprotoHandle !== fields.atprotoHandle
        )
          await bridge.update(id, fields)
      } else {
        await bridge.create(
          ProfileSchema,
          { ...fields, did: did as `did:key:${string}`, displayName: socialName || socialHandle },
          id
        )
      }
    })().catch(() => {
      if (active)
        setError(
          'Your account is verified, but the local profile could not be saved. Reopen your profile to retry.'
        )
    })
    return () => {
      active = false
    }
  }, [bridge, did, socialSubject, socialHandle, socialName])
  const act = async (action: () => Promise<void>) => {
    setError('')
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(
        (cause instanceof Error ? cause.message : String(cause)).replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          ''
        )
      )
    }
  }
  const phase = snapshot?.signIn.phase
  const busy = phase === 'preparing' || phase === 'waiting' || phase === 'verifying'
  return (
    <section
      aria-label="Connected account"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      {social ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Check size={16} /> @{social.handle}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Bluesky identity verified on this device. Your xNet recovery key stays separate.
          </p>
          <button
            type="button"
            disabled={busy}
            className="text-xs underline underline-offset-4"
            onClick={() =>
              void act(async () => {
                if (!bridge?.get || !did) throw new Error('Your profile is still loading.')
                const id = profileNodeId(did)
                const existing = await bridge.get(id)
                if (existing?.properties.atprotoDid === social.subject)
                  await bridge.update(id, { atprotoDid: '', atprotoHandle: '' })
                await window.xnetOnboarding.unlinkBluesky()
              })
            }
          >
            Disconnect Bluesky
          </button>
        </>
      ) : (
        <>
          <label htmlFor="desktop-bluesky-handle" className="block text-sm font-medium">
            Use your Bluesky identity
          </label>
          <input
            id="desktop-bluesky-handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="you.bsky.social or your domain"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={253}
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Verify your account in your browser. xNet won’t ask to post, read private messages, or
            change your account.
          </p>
          {!busy && (
            <button
              type="button"
              disabled={!handle.trim() || !snapshot}
              onClick={() => void act(() => window.xnetOnboarding.signInBluesky(handle))}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
            >
              Continue with Bluesky
            </button>
          )}
        </>
      )}
      {busy && (
        <div role="status" className="flex items-center gap-2 text-sm">
          <Loader2 size={16} className="motion-safe:animate-spin" />
          {phase === 'preparing'
            ? 'Opening secure sign-in…'
            : phase === 'waiting'
              ? 'Waiting for you in your browser…'
              : 'Verifying your account…'}
          <button
            type="button"
            className="ml-auto text-xs underline"
            onClick={() => void act(() => window.xnetOnboarding.cancelSignIn())}
          >
            Cancel
          </button>
        </div>
      )}
      {(error || snapshot?.signIn.message) && (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error || snapshot?.signIn.message}
        </p>
      )}
    </section>
  )
}
