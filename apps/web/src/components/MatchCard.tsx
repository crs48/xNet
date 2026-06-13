/**
 * MatchCard (exploration 0174) — one candidate with the "why you matched"
 * evidence and a private wave button. No cold contact: a wave is only revealed
 * to the other side when they wave back.
 */
import type { MatchListing } from '../hooks/useConnect'
import { DIDAvatar } from '@xnetjs/ui'
import { useState } from 'react'

export interface MatchCardProps {
  match: MatchListing
  onWave: () => Promise<{ matched: boolean }>
}

export function MatchCard({ match, onWave }: MatchCardProps) {
  const [state, setState] = useState<'idle' | 'waving' | 'waved' | 'matched'>('idle')

  const handleWave = async () => {
    setState('waving')
    const { matched } = await onWave()
    setState(matched ? 'matched' : 'waved')
  }

  const hops = match.why.graphPath ? match.why.graphPath.length - 1 : null

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4">
      <DIDAvatar did={match.did} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{match.displayName}</span>
          {match.handle && <span className="text-xs text-muted-foreground">@{match.handle}</span>}
          <span className="ml-auto text-xs text-muted-foreground">
            {Math.round(match.score * 100)}% match
          </span>
        </div>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {match.why.sharedInterests.length > 0 && (
            <li>{match.why.sharedInterests.length} shared interest(s)</li>
          )}
          {hops !== null && hops > 0 && (
            <li>
              {hops} hop{hops === 1 ? '' : 's'} away
              {match.why.graphPath && match.why.graphPath.length > 2
                ? ` via ${match.why.graphPath[1].slice(0, 10)}…`
                : ''}
            </li>
          )}
          {match.why.proximity !== null && <li>Nearby</li>}
          <li className="opacity-70">{match.source === 'local' ? 'In your network' : 'Open match'}</li>
        </ul>
      </div>
      <button
        type="button"
        onClick={() => void handleWave()}
        disabled={state !== 'idle'}
        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50 disabled:opacity-60"
      >
        {state === 'idle' && 'Wave 👋'}
        {state === 'waving' && '…'}
        {state === 'waved' && 'Waved'}
        {state === 'matched' && "It's a match! 🎉"}
      </button>
    </div>
  )
}
