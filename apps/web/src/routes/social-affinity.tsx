/**
 * "What you and @friend both saved" (exploration 0420).
 *
 * The payoff of publishing: overlap computed across networks, from records in
 * each person's own repo, by an appview anyone can run.
 *
 * What this screen deliberately never shows: a ranking, a global count, a
 * "most-saved", or a similarity score against everyone. The endpoint it calls
 * cannot produce one — a public like corpus with a scoreboard is a recommender
 * (0378), and that is the failure mode this whole feature is designed around.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useXNet } from '@xnetjs/react'
import { useAtprotoIdentity } from '../hooks/useAtprotoIdentity'
import { Loader2, Users } from 'lucide-react'
import React, { useCallback, useState } from 'react'

export const Route = createFileRoute('/social-affinity')({
  component: SocialAffinityPage
})

interface AffinityResponse {
  actors: [string, string]
  shared: Array<{
    subject: string
    platform?: string
    interactionKind?: string
    createdAt?: string
  }>
  counts: Record<string, number>
}

function SocialAffinityPage() {
  const atproto = useAtprotoIdentity()
  const { hubUrl } = useXNet()
  const [other, setOther] = useState('')
  const [result, setResult] = useState<AffinityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mine = atproto?.did

  const compare = useCallback(async () => {
    if (!mine || !other.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const url = new URL('/xrpc/fyi.xnet.affinity.compare', hubUrl ?? window.location.origin)
      // Two named actors. There is no "compare me with everyone" form of this
      // call, and adding one would be the scoreboard.
      url.searchParams.append('actors', mine)
      url.searchParams.append('actors', other.trim())
      const res = await fetch(url)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `Comparison failed (${res.status})`)
      }
      setResult((await res.json()) as AffinityResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [mine, other, hubUrl])

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold">What you have in common</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Compares what you and one other person have published — across YouTube, Instagram,
          TikTok and anywhere else either of you imported from. Both sides read from their own
          repos; nothing here is stored.
        </p>
      </header>

      {!mine ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Link an AT Protocol account and publish something first — there is nothing to compare
          until then.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="did:plc:… or a handle"
              className="flex-1 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void compare()}
              disabled={loading || !other.trim()}
              className="flex items-center gap-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
              Compare
            </button>
          </div>

          {error && (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              {error}
            </p>
          )}

          {result && (
            <section className="space-y-3">
              <p className="text-sm">
                <strong>{result.shared.length}</strong> in common. You published{' '}
                {result.counts[result.actors[0]] ?? 0}; they published{' '}
                {result.counts[result.actors[1]] ?? 0}.
              </p>
              {result.shared.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Nothing overlapping yet. That is a real answer, not an error — most pairs of
                  people share very little, which is what makes an overlap worth noticing.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
                  {result.shared.map((item) => (
                    <li key={item.subject} className="p-3 text-sm">
                      <a
                        href={item.subject}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline break-all"
                      >
                        {item.subject}
                      </a>
                      {(item.platform || item.interactionKind) && (
                        <span className="ml-2 text-xs text-[var(--text-secondary)]">
                          {[item.platform, item.interactionKind].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
