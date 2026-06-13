/**
 * /discover (exploration 0174) — the people-matching surface.
 *
 * Pick an intent, see explained candidates (friends-of-friends + opt-in hub
 * directory), and wave privately. No public posting, no cold messages: a wave is
 * only revealed when the other side waves back.
 */
import { createFileRoute } from '@tanstack/react-router'
import { connectionIntentKinds, type ConnectionIntentKind } from '@xnetjs/social/connect'
import { useState } from 'react'
import { ConnectableProfileEditor } from '../components/ConnectableProfileEditor'
import { MatchCard } from '../components/MatchCard'
import { useMatchmaker, useWave } from '../hooks/useConnect'

export const Route = createFileRoute('/discover')({
  component: DiscoverPage
})

function DiscoverPage() {
  const [intent, setIntent] = useState<ConnectionIntentKind>('friends')
  const { matches, loading } = useMatchmaker(intent)
  const { wave } = useWave()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-xl font-semibold">Discover people</h1>
        <p className="text-sm text-muted-foreground">
          Matched on shared interests and your network. Wave privately — it only opens a chat when
          you both wave.
        </p>
      </header>

      <ConnectableProfileEditor />

      <section className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {connectionIntentKinds.map((kind) => (
            <button
              key={kind.id}
              type="button"
              onClick={() => setIntent(kind.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                intent === kind.id
                  ? 'border-accent bg-accent text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent/50'
              }`}
            >
              {kind.name}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-muted-foreground">Finding matches…</p>}
        {!loading && matches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No matches yet. Enable your profile and intents above, and check back as more people opt
            in.
          </p>
        )}

        <div className="space-y-2">
          {matches.map((match) => (
            <MatchCard key={match.did} match={match} onWave={() => wave(match.did, intent)} />
          ))}
        </div>
      </section>
    </div>
  )
}
