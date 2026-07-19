/**
 * apps/web — verified ATProto handle chip (0322/0338).
 *
 * Shows a linked ATProto handle and asks the hub to confirm the bidirectional
 * `fyi.xnet.identity.binding` is genuine (`GET /atproto/binding/:did?xnet=…`).
 * "Linked" (stored on the profile) and "verified" (hub-confirmed) are distinct:
 * the check runs against the hub the app is connected to and degrades to
 * "linked, unverified" when no hub is configured or the check fails.
 */
import { useEffect, useState } from 'react'

type VerifyState = 'checking' | 'verified' | 'unverified'

export function VerifiedHandle(props: {
  atprotoDid: string
  atprotoHandle: string
  xnetDid: string
  /** Hub HTTPS base URL, e.g. https://hub.xnet.fyi. Omit to skip verification. */
  hubHttpUrl?: string
}): JSX.Element {
  const { atprotoDid, atprotoHandle, xnetDid, hubHttpUrl } = props
  const [state, setState] = useState<VerifyState>(hubHttpUrl ? 'checking' : 'unverified')

  useEffect(() => {
    if (!hubHttpUrl) {
      setState('unverified')
      return
    }
    let cancelled = false
    setState('checking')
    const url =
      `${hubHttpUrl.replace(/\/+$/, '')}/atproto/binding/${encodeURIComponent(atprotoDid)}` +
      `?xnet=${encodeURIComponent(xnetDid)}`
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { verified?: boolean } | null) => {
        if (!cancelled) setState(body?.verified ? 'verified' : 'unverified')
      })
      .catch(() => {
        if (!cancelled) setState('unverified')
      })
    return () => {
      cancelled = true
    }
  }, [atprotoDid, xnetDid, hubHttpUrl])

  const verified = state === 'verified'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-0 px-2 py-0.5 text-[11px] text-ink-2"
      title={
        verified
          ? `Verified: ${atprotoHandle} is cryptographically bound to this identity`
          : state === 'checking'
            ? 'Checking binding…'
            : `Linked to ${atprotoHandle} (not verified by this hub)`
      }
    >
      {verified ? (
        <svg className="h-3 w-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      ) : (
        <span className="h-2 w-2 rounded-full bg-ink-3" aria-hidden />
      )}
      @{atprotoHandle}
      {!verified && state !== 'checking' && <span className="text-ink-3">· unverified</span>}
    </span>
  )
}
