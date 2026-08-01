/**
 * The publication ceremony (exploration 0420).
 *
 * Publishing an affinity set is a **one-way door**. Everything about this
 * screen is shaped by that:
 *
 * - the bucket is chosen, never assumed — "publish my social graph" is not a
 *   question anyone can answer;
 * - the preview shows the real record JSON, because a user who agreed to a
 *   sentence has not agreed to bytes;
 * - the confirmation is per-run and is never remembered;
 * - DMs, searches and follow lists are ABSENT from the picker, not defaulted
 *   off, because they describe people who never agreed;
 * - "Withdraw" says plainly that it is not retraction.
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useNodeStore } from '@xnetjs/react'
import {
  buildAiPreferenceRecords,
  buildPublishPreview,
  indexByNodeId,
  reconcile,
  runPublish,
  runWithdraw,
  selectBucket,
  selectableInteractionKinds,
  selectablePlatforms,
  PREFERENCE_AI_NSID,
  type AiUsePreferences,
  type BucketSelection,
  type PublishProgress,
  type PublishableEdge,
  type PublishedEdge
} from '@xnetjs/social/publish'
import { AlertTriangle, Globe, Loader2, Lock, Send, Undo2 } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtprotoIdentity } from '../hooks/useAtprotoIdentity'
import { createAtprotoRepoWriter, RECONCILE_COLLECTION } from '../lib/atproto-repo-writer'
import {
  loadPublishMap,
  markEdgesPublic,
  resolvePublishableEdges,
  savePublishMap
} from '../lib/social-publish'

export const Route = createFileRoute('/social-publish')({
  component: SocialPublishPage
})

/** The exact words. Not "delete", not "make private" — neither is true. */
const ONE_WAY_DOOR =
  'Publishing is permanent. A record put in your repo goes onto the public firehose, ' +
  'where anyone may archive it. Withdrawing later removes it from your repo and asks ' +
  'others to stop serving it — it does not take it back.'

type Phase = 'choose' | 'preview' | 'publishing' | 'done'

function SocialPublishPage() {
  const { store, isReady } = useNodeStore()
  const atproto = useAtprotoIdentity()
  const [edges, setEdges] = useState<PublishableEdge[]>([])
  const [selection, setSelection] = useState<BucketSelection>({})
  const [phase, setPhase] = useState<Phase>('choose')
  const [includeAffinity, setIncludeAffinity] = useState(false)
  const [aiPreferences, setAiPreferences] = useState<AiUsePreferences>({})
  const [confirmText, setConfirmText] = useState('')
  const [progress, setProgress] = useState<PublishProgress | null>(null)
  const [published, setPublished] = useState<PublishedEdge[]>([])
  const [error, setError] = useState<string | null>(null)

  const atprotoDid = atproto?.did

  useEffect(() => {
    if (!store || !isReady) return
    void resolvePublishableEdges(store)
      .then(setEdges)
      .catch((e) => setError(String(e)))
  }, [store, isReady])

  const bucket = useMemo(() => selectBucket(edges, selection), [edges, selection])
  const preview = useMemo(
    () => buildPublishPreview(bucket, { includeAffinity }),
    [bucket, includeAffinity]
  )

  // Consent is never remembered: leaving the preview clears it, so a second
  // run always re-asks. A remembered checkbox is how one-way doors get walked
  // through by accident.
  useEffect(() => {
    if (phase !== 'preview') setConfirmText('')
  }, [phase])

  const publish = useCallback(async () => {
    if (!store || !atprotoDid) return
    setPhase('publishing')
    setError(null)
    try {
      const session = await resolveSession(atprotoDid)
      const writer = createAtprotoRepoWriter(session)

      // Reconcile BEFORE the first write. Skipping this is how a lost local map
      // becomes two thousand duplicate records.
      const remote = await writer.listRecords(RECONCILE_COLLECTION)
      const bySubject = new Map(bucket.included.map((e) => [e.targetUrl ?? '', e.nodeId] as const))
      const reconciled = reconcile(loadPublishMap(atprotoDid), remote, (s) => bySubject.get(s))

      // The AI-use declaration goes first, so it is in place before the records
      // it speaks for exist — not after, when they have already been crawled.
      for (const { rkey, record } of buildAiPreferenceRecords({
        preferences: aiPreferences,
        createdAt: new Date().toISOString()
      })) {
        await writer.putRecord({
          collection: PREFERENCE_AI_NSID,
          rkey,
          record: record as unknown as Record<string, unknown>
        })
      }

      const result = await runPublish(bucket.included, indexByNodeId(reconciled.map), writer, {
        includeAffinity,
        onProgress: setProgress
      })

      const all = [...reconciled.map, ...result.written]
      setPublished(all)
      await markEdgesPublic(
        store,
        result.written.map((e) => e.nodeId)
      )
      try {
        savePublishMap(atprotoDid, all)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      if (!result.complete) {
        setError(
          `Stopped after ${result.published} of ${bucket.included.length}` +
            (result.stoppedBecause ? ` (${result.stoppedBecause})` : '') +
            '. Nothing was lost — run it again to continue where it left off.'
        )
      }
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('preview')
    }
  }, [store, atprotoDid, bucket, includeAffinity, aiPreferences])

  const withdraw = useCallback(async () => {
    if (!atprotoDid || published.length === 0) return
    const session = await resolveSession(atprotoDid)
    const result = await runWithdraw(published, createAtprotoRepoWriter(session))
    const remaining = published.filter((e) => !result.withdrawn.includes(e.nodeId))
    setPublished(remaining)
    savePublishMap(atprotoDid, remaining)
  }, [atprotoDid, published])

  if (!atprotoDid) {
    return (
      <Shell>
        <p className="text-sm text-[var(--text-secondary)]">
          Publishing writes records to <strong>your own</strong> AT Protocol repo, so it needs your
          account linked first. xNet never holds them — that is what makes the published set survive
          us.
        </p>
        <Link to="/settings" className="text-sm underline">
          Link an AT Protocol account in Settings
        </Link>
      </Shell>
    )
  }

  return (
    <Shell>
      <Callout>{ONE_WAY_DOOR}</Callout>

      {phase === 'choose' && (
        <Chooser
          bucket={bucket}
          selection={selection}
          onChange={setSelection}
          includeAffinity={includeAffinity}
          onIncludeAffinity={setIncludeAffinity}
          onNext={() => setPhase('preview')}
        />
      )}

      {phase === 'preview' && (
        <Preview
          preview={preview}
          confirmText={confirmText}
          onConfirmText={setConfirmText}
          aiPreferences={aiPreferences}
          onAiPreferences={setAiPreferences}
          onBack={() => setPhase('choose')}
          onPublish={publish}
        />
      )}

      {phase === 'publishing' && progress && (
        <p className="text-sm">
          <Loader2 className="inline size-4 animate-spin" /> {progress.published} published,{' '}
          {progress.staged} not yet written, {progress.failed} failed.
        </p>
      )}

      {phase === 'done' && (
        <div className="space-y-3">
          <p className="text-sm">
            <Globe className="inline size-4" /> {published.length} record
            {published.length === 1 ? '' : 's'} are in your repo.
          </p>
          <button
            type="button"
            onClick={() => void withdraw()}
            className="flex items-center gap-2 rounded border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            <Undo2 className="size-4" /> Withdraw all
          </button>
          <p className="text-xs text-[var(--text-secondary)]">
            Withdrawing deletes the records from your repo and asks other services to stop serving
            them. Copies already archived from the firehose are beyond anyone&rsquo;s reach,
            including ours.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{error}</p>
      )}
    </Shell>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold">Publish your affinity</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Share what you saved — a link, a date, your own tags — so friends can find what you have
          in common outside any one network. Titles, thumbnails and descriptions stay on this
          device: they belong to the platform and the creator, not to you.
        </p>
      </header>
      {children}
    </div>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Chooser({
  bucket,
  selection,
  onChange,
  includeAffinity,
  onIncludeAffinity,
  onNext
}: {
  bucket: ReturnType<typeof selectBucket>
  selection: BucketSelection
  onChange: (s: BucketSelection) => void
  includeAffinity: boolean
  onIncludeAffinity: (v: boolean) => void
  onNext: () => void
}) {
  const kinds = selectableInteractionKinds()
  const platforms = selectablePlatforms()
  const toggle = <T,>(list: readonly T[] | undefined, value: T): T[] => {
    const current = list ? [...list] : []
    const at = current.indexOf(value)
    if (at === -1) current.push(value)
    else current.splice(at, 1)
    return current
  }

  return (
    <div className="space-y-4">
      <Fieldset legend="What kind">
        {kinds.map((kind) => (
          <Check
            key={kind}
            label={kind}
            checked={!selection.interactionKinds || selection.interactionKinds.includes(kind)}
            onChange={() =>
              onChange({ ...selection, interactionKinds: toggle(selection.interactionKinds, kind) })
            }
          />
        ))}
      </Fieldset>

      <Fieldset legend="From where">
        {platforms.map((platform) => (
          <Check
            key={platform}
            label={platform}
            checked={!selection.platforms || selection.platforms.includes(platform)}
            onChange={() =>
              onChange({ ...selection, platforms: toggle(selection.platforms, platform) })
            }
          />
        ))}
      </Fieldset>

      {/*
        The absence below is the feature. Messages, searches and follow lists
        are not listed with an unticked box — they cannot be reached from here
        at all, because they describe people who never agreed to be described.
      */}
      <p className="flex gap-2 text-xs text-[var(--text-secondary)]">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Messages, comments, search history and who you follow are never offered here. They describe
        other people, and that is not yours to publish.
      </p>

      <Check
        label="Also write xNet's richer record (platform and interaction kind as real fields — doubles the number of writes)"
        checked={includeAffinity}
        onChange={() => onIncludeAffinity(!includeAffinity)}
      />

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-sm">
          <strong>{bucket.included.length}</strong> selected · {bucket.excluded.length} excluded
        </span>
        <button
          type="button"
          disabled={bucket.included.length === 0}
          onClick={onNext}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Review the records
        </button>
      </div>
    </div>
  )
}

function Preview({
  preview,
  confirmText,
  onConfirmText,
  aiPreferences,
  onAiPreferences,
  onBack,
  onPublish
}: {
  preview: ReturnType<typeof buildPublishPreview>
  confirmText: string
  onConfirmText: (v: string) => void
  aiPreferences: AiUsePreferences
  onAiPreferences: (p: AiUsePreferences) => void
  onBack: () => void
  onPublish: () => void
}) {
  // A typed confirmation, not a checkbox: the friction is the point on a door
  // that does not open the other way.
  const CONFIRM_WORD = 'publish'
  const ready = confirmText.trim().toLowerCase() === CONFIRM_WORD

  return (
    <div className="space-y-4">
      <p className="text-sm">
        This writes <strong>{preview.count}</strong> record
        {preview.count === 1 ? '' : 's'}.
        {preview.estimatedDays > 0.25 && (
          <>
            {' '}
            At the rate a PDS accepts writes that takes roughly{' '}
            <strong>{preview.estimatedDays.toFixed(1)} days</strong> of trickling — you can stop and
            resume, but publishing less is usually the better answer.
          </>
        )}
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Exactly what goes into your repo</h2>
        {preview.samples.map((sample) => (
          <pre
            key={sample.nodeId}
            className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs"
          >
            {JSON.stringify(
              sample.affinity ? [sample.bookmark, sample.affinity] : sample.bookmark,
              null,
              2
            )}
          </pre>
        ))}
      </div>

      <Fieldset legend="What others may do with it">
        {(['training', 'syntheticContent', 'inference', 'embedding'] as const).map((key) => (
          <Check
            key={key}
            label={AI_LABELS[key]}
            checked={aiPreferences[key] ?? DEFAULTS[key]}
            onChange={() =>
              onAiPreferences({ ...aiPreferences, [key]: !(aiPreferences[key] ?? DEFAULTS[key]) })
            }
          />
        ))}
        <p className="text-xs text-[var(--text-secondary)]">
          Published alongside your records as a declaration others can read. It has the standing of
          a robots.txt: it does not stop anyone, it removes their excuse.
        </p>
      </Fieldset>

      <label className="block text-sm">
        Type <code>{CONFIRM_WORD}</code> to confirm. We ask every time — this is not remembered.
        <input
          value={confirmText}
          onChange={(e) => onConfirmText(e.target.value)}
          className="mt-1 block w-48 rounded border border-[var(--border)] px-2 py-1"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={onPublish}
          className="flex items-center gap-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          <Send className="size-4" /> Publish
        </button>
      </div>
    </div>
  )
}

const AI_LABELS = {
  training: 'Train models on it',
  syntheticContent: 'Generate new content from it',
  inference: 'Look it up to answer a question (retrieval)',
  embedding: 'Index it for semantic search'
} as const

const DEFAULTS = {
  training: false,
  syntheticContent: false,
  inference: true,
  embedding: true
} as const

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5 rounded border border-[var(--border)] p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {legend}
      </legend>
      {children}
    </fieldset>
  )
}

function Check({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5" />
      <span>{label}</span>
    </label>
  )
}

/**
 * Restore the OAuth session for a DID.
 *
 * Kept as a seam rather than inlined so the ceremony can be driven in the real
 * app against a test PDS without a popup. It throws rather than returning a
 * null session: "we could not prove who you are" must never be a state that
 * quietly proceeds to write records.
 */
async function resolveSession(did: string) {
  const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser')
  const client = await BrowserOAuthClient.load({
    clientId: 'https://xnet.fyi/oauth/atproto-client.json',
    handleResolver: 'https://bsky.social'
  })
  const session = await client.restore(did)
  if (!session) {
    throw new Error(
      'Your AT Protocol session has expired. Sign in again from Settings before publishing.'
    )
  }
  return session
}
