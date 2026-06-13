/**
 * SafetyCenterSettings (exploration 0176) — blocked accounts + a moderation log.
 *
 * Transparency, framed as *your* choices: the people you've muted/blocked, and a
 * record of what you've reported and self-labelled. Filtering here is personal
 * and client-side, never platform censorship.
 */
import { AbuseReportSchema, ModerationLabelSchema, ProfileSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useState } from 'react'
import { useBlockList, type BlockState } from '../lib/block-list'
import { importBlocklist } from '../lib/blocklist-import'

type Row = Record<string, unknown>

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const STATE_LABEL: Record<BlockState, string> = {
  blocked: 'Blocked',
  muted: 'Muted',
  restricted: 'Restricted'
}

function SharedBlocklistImport({
  onImport
}: {
  onImport: (blocks: readonly { did: string; state: BlockState }[]) => void
}) {
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const handleImport = () => {
    const result = importBlocklist(text)
    if (!result.ok) {
      setFeedback({ ok: false, message: result.error })
      return
    }
    onImport(result.blocks)
    const issuer = result.list.issuerDID.slice(0, 16)
    setFeedback({
      ok: true,
      message: `Imported ${result.blocks.length} account(s) from ${issuer}….`
    })
    setText('')
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Shared blocklists</h3>
      <p className="text-xs text-muted-foreground">
        Paste a signed community blocklist to apply its blocks and mutes to your own view. The
        signature is verified before anything is applied — nothing here is sent anywhere.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setFeedback(null)
        }}
        placeholder='{"list": …, "signature": …}'
        rows={4}
        aria-label="Signed blocklist JSON"
        className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 font-mono text-xs"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={text.trim().length === 0}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent/50 disabled:opacity-40"
        >
          Verify &amp; import
        </button>
        {feedback && (
          <span className={`text-xs ${feedback.ok ? 'text-emerald-600' : 'text-destructive'}`}>
            {feedback.message}
          </span>
        )}
      </div>
    </section>
  )
}

export function SafetyCenterSettings() {
  const { list, unblock, importMany } = useBlockList()
  const { authorDID } = useXNet()
  const me = authorDID ?? ''
  const { data: profiles } = useQuery(ProfileSchema, {})
  const { data: reports } = useQuery(AbuseReportSchema, {})
  const { data: labels } = useQuery(ModerationLabelSchema, {})

  const nameOf = (did: string): string => {
    const profile = ((profiles ?? []) as unknown as Row[]).find((p) => str(p.did) === did)
    return (profile && str(profile.displayName)) ?? `${did.slice(0, 16)}…`
  }

  const entries: { did: string; state: BlockState }[] = [
    ...list.blocked.map((did) => ({ did, state: 'blocked' as const })),
    ...list.muted.map((did) => ({ did, state: 'muted' as const })),
    ...list.restricted.map((did) => ({ did, state: 'restricted' as const }))
  ]

  const myReports = ((reports ?? []) as unknown as Row[]).filter((r) => str(r.reporter) === me)
  const mySelfLabels = ((labels ?? []) as unknown as Row[]).filter(
    (l) => str(l.sourceDID) === me && str(l.sourceType) === 'user'
  )

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h2 className="text-lg font-semibold">Safety center</h2>
        <p className="text-sm text-muted-foreground">
          People you've muted or blocked, and a log of what you've reported or marked sensitive.
          These are your personal choices — they don't change what others see.
        </p>
      </header>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Blocked &amp; muted accounts</h3>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">You haven't blocked or muted anyone.</p>
        ) : (
          <ul className="space-y-1">
            {entries.map(({ did, state }) => (
              <li
                key={did}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{nameOf(did)}</div>
                  <div className="text-xs text-muted-foreground">{STATE_LABEL[state]}</div>
                </div>
                <button
                  type="button"
                  onClick={() => unblock(did)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SharedBlocklistImport onImport={importMany} />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Your reports</h3>
        {myReports.length === 0 ? (
          <p className="text-xs text-muted-foreground">You haven't reported anything.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {myReports.map((report) => (
              <li key={str(report.id)} className="rounded-md border border-border px-3 py-1.5">
                Reported <span className="text-foreground">{str(report.category)}</span> ·{' '}
                {str(report.status) ?? 'open'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Content you've marked sensitive</h3>
        {mySelfLabels.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing marked yet.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {mySelfLabels.length} item(s) self-labelled.
          </p>
        )}
      </section>
    </div>
  )
}
