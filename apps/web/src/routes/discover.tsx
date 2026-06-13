/**
 * /discover (exploration 0174) — the people-matching surface.
 *
 * Pick an intent, see explained candidates (friends-of-friends + opt-in hub
 * directory), and wave privately. No public posting, no cold messages: a wave is
 * only revealed when the other side waves back.
 */
import { createFileRoute } from '@tanstack/react-router'
import { DIDAvatar } from '@xnetjs/ui'
import { connectionIntentKinds, type ConnectionIntentKind } from '@xnetjs/social/connect'
import { useState } from 'react'
import { ConnectableProfileEditor } from '../components/ConnectableProfileEditor'
import { MatchCard } from '../components/MatchCard'
import { useMatchmaker, useReceivedWaves, useWave } from '../hooks/useConnect'

export const Route = createFileRoute('/discover')({
  component: DiscoverPage
})

const INTENT_LABEL = new Map(connectionIntentKinds.map((kind) => [kind.id, kind.name]))

/** Incoming waves — wave back to match (opens a DM) or ignore. */
function WavesReceived() {
  const { waves, ignore } = useReceivedWaves()
  const { wave } = useWave()
  if (waves.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Waves received</h2>
      <div className="space-y-2">
        {waves.map((received) => (
          <div
            key={received.id}
            className="flex items-center gap-3 rounded-lg border border-border p-3"
          >
            <DIDAvatar did={received.fromDid} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{received.displayName}</div>
              <div className="text-xs text-muted-foreground">
                waved · {INTENT_LABEL.get(received.intentKind) ?? received.intentKind}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void wave(received.fromDid, received.intentKind)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
            >
              Wave back 👋
            </button>
            <button
              type="button"
              onClick={() => void ignore(received.id)}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50"
            >
              Ignore
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

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

      <WavesReceived />

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
