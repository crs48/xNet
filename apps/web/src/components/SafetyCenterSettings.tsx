/**
 * SafetyCenterSettings (exploration 0176) — blocked accounts + a moderation log.
 *
 * Transparency, framed as *your* choices: the people you've muted/blocked, and a
 * record of what you've reported and self-labelled. Filtering here is personal
 * and client-side, never platform censorship. Workbench-idiom styling (0179).
 */
import { AbuseReportSchema, ModerationLabelSchema, ProfileSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { SettingsGroup, SettingsPanel } from '@xnetjs/ui'
import { useState } from 'react'
import { useBlockList, type BlockState } from '../lib/block-list'
import { importBlocklist } from '../lib/blocklist-import'
import { useLabelerSubscriptions } from '../lib/labeler-subscriptions'

type Row = Record<string, unknown>

/** Quiet bordered button — the workbench's default action affordance. */
const QUIET_BUTTON =
  'rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:opacity-40'
const QUIET_BUTTON_SM =
  'rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-1 transition-colors hover:bg-surface-2'
const LIST_ROW =
  'flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2'

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
    <SettingsGroup
      label="Shared blocklists"
      description="Paste a signed community blocklist to apply its blocks and mutes to your own view. The signature is verified before anything is applied — nothing here is sent anywhere."
    >
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setFeedback(null)
        }}
        placeholder='{"list": …, "signature": …}'
        rows={4}
        aria-label="Signed blocklist JSON"
        className="w-full resize-y rounded-md border border-hairline bg-surface-0 px-3 py-2 font-mono text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={text.trim().length === 0}
          className={QUIET_BUTTON}
        >
          Verify &amp; import
        </button>
        {feedback && (
          <span className={`text-xs ${feedback.ok ? 'text-success' : 'text-destructive'}`}>
            {feedback.message}
          </span>
        )}
      </div>
    </SettingsGroup>
  )
}

const TRUST_OPTIONS: { label: string; value: number }[] = [
  { label: 'Observe (weak)', value: 0.3 },
  { label: 'Review (medium)', value: 0.6 },
  { label: 'Trusted (strong)', value: 0.9 }
]

function trustLabel(trust: number): string {
  if (trust >= 0.75) return 'Trusted'
  if (trust >= 0.4) return 'Review'
  return 'Observe'
}

function SubscribedLabelers() {
  const { subscriptions, ready, subscribe, setEnabled, unsubscribe } = useLabelerSubscriptions()
  const [did, setDid] = useState('')
  const [trust, setTrust] = useState(TRUST_OPTIONS[1].value)

  const handleSubscribe = () => {
    void subscribe(did, trust)
    setDid('')
  }

  return (
    <SettingsGroup
      label="Subscribed labelers"
      description="Trust a moderation labeler by its DID. Its labels count toward your filters at the weight you choose — and only yours. Disable a labeler to stop applying it without forgetting it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={did}
          onChange={(e) => setDid(e.target.value)}
          placeholder="did:key:… (labeler)"
          aria-label="Labeler DID"
          className="h-8 min-w-0 flex-1 rounded-md border border-hairline bg-surface-0 px-2 font-mono text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
        />
        <select
          value={trust}
          onChange={(e) => setTrust(Number(e.target.value))}
          aria-label="Trust level"
          className="h-8 rounded-md border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none focus:border-border-emphasis"
        >
          {TRUST_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSubscribe}
          // Also gate on `ready`: subscribing before the data bridge + identity are
          // live silently no-ops, leaving nothing rendered. Keeping the button
          // disabled until then makes the action deterministic (and fixes an e2e
          // flake where the click landed during that window).
          disabled={!ready || did.trim().length === 0}
          className={QUIET_BUTTON}
        >
          Subscribe
        </button>
      </div>

      {subscriptions.length === 0 ? (
        <p className="mt-2 text-xs text-ink-3">You haven't subscribed to any labelers.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {subscriptions.map((sub) => (
            <li key={sub.id} className={LIST_ROW}>
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-ink-1">{sub.labelerDID}</div>
                <div className="text-xs text-ink-3">
                  {sub.enabled ? trustLabel(sub.trust) : 'Disabled'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void setEnabled(sub.id, !sub.enabled)}
                  className={QUIET_BUTTON_SM}
                >
                  {sub.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => void unsubscribe(sub.id)}
                  className={QUIET_BUTTON_SM}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsGroup>
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
    <SettingsPanel
      className="max-w-2xl"
      title="Safety center"
      description="People you've muted or blocked, and a log of what you've reported or marked sensitive. These are your personal choices — they don't change what others see."
    >
      <SettingsGroup label="Blocked & muted accounts">
        {entries.length === 0 ? (
          <p className="text-xs text-ink-3">You haven't blocked or muted anyone.</p>
        ) : (
          <ul className="space-y-1">
            {entries.map(({ did, state }) => (
              <li key={did} className={LIST_ROW}>
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink-1">{nameOf(did)}</div>
                  <div className="text-xs text-ink-3">{STATE_LABEL[state]}</div>
                </div>
                <button type="button" onClick={() => unblock(did)} className={QUIET_BUTTON_SM}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsGroup>

      <SharedBlocklistImport onImport={importMany} />

      <SubscribedLabelers />

      <SettingsGroup label="Your reports">
        {myReports.length === 0 ? (
          <p className="text-xs text-ink-3">You haven't reported anything.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-3">
            {myReports.map((report) => (
              <li key={str(report.id)} className="rounded-md border border-hairline px-3 py-1.5">
                Reported <span className="text-ink-1">{str(report.category)}</span> ·{' '}
                {str(report.status) ?? 'open'}
              </li>
            ))}
          </ul>
        )}
      </SettingsGroup>

      <SettingsGroup label="Content you've marked sensitive">
        {mySelfLabels.length === 0 ? (
          <p className="text-xs text-ink-3">Nothing marked yet.</p>
        ) : (
          <p className="text-xs text-ink-3">{mySelfLabels.length} item(s) self-labelled.</p>
        )}
      </SettingsGroup>
    </SettingsPanel>
  )
}
