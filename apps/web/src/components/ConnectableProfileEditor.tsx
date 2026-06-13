/**
 * ConnectableProfileEditor (exploration 0174) — opt-in matching profile.
 *
 * Consent is off by default: nothing is discoverable until `enabled` is on and
 * visibility is raised. Interests are curated from the user's own tags (the
 * derivation seed), and intents are toggled per kind.
 */
import { TagSchema } from '@xnetjs/data'
import {
  ConnectableProfileSchema,
  ConnectionIntentSchema,
  connectionIntentKinds,
  type ConnectionIntentKind
} from '@xnetjs/social/connect'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useEffect, useMemo, useState } from 'react'

type Row = Record<string, unknown>

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function ConnectableProfileEditor() {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const did = authorDID ?? ''

  const { data: myProfiles } = useQuery(ConnectableProfileSchema, {
    where: { did: did as `did:key:${string}` }
  })
  const profile = (myProfiles ?? [])[0] as unknown as Row | undefined
  const profileId = profile ? str(profile.id) : undefined

  const { data: intents } = useQuery(ConnectionIntentSchema, {})
  const { data: tags } = useQuery(TagSchema, {})

  const [headline, setHeadline] = useState('')
  const [about, setAbout] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setHeadline(str(profile?.headline) ?? '')
    setAbout(str(profile?.about) ?? '')
    setEnabled(profile?.enabled === true)
    setSelectedInterests(
      Array.isArray(profile?.interests)
        ? (profile?.interests as unknown[]).filter((id): id is string => typeof id === 'string')
        : []
    )
  }, [profile])

  const myIntents = useMemo(() => {
    const map = new Map<ConnectionIntentKind, Row>()
    for (const intent of (intents ?? []) as unknown as Row[]) {
      if (profileId && str(intent.profile) === profileId) {
        const kind = str(intent.kind) as ConnectionIntentKind | undefined
        if (kind) map.set(kind, intent)
      }
    }
    return map
  }, [intents, profileId])

  const save = async () => {
    if (!bridge || !did) return
    const fields = {
      headline: headline.trim(),
      about: about.trim(),
      enabled,
      visibility: (enabled ? 'hub-indexed' : 'private') as 'hub-indexed' | 'private',
      interests: selectedInterests
    }
    if (profile) await bridge.update(String(profile.id), fields)
    else await bridge.create(ConnectableProfileSchema, { did: did as `did:key:${string}`, ...fields })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const toggleIntent = async (kind: ConnectionIntentKind) => {
    if (!bridge || !profileId) return
    const existing = myIntents.get(kind)
    if (existing) {
      await bridge.update(String(existing.id), { active: existing.active !== true })
    } else {
      await bridge.create(ConnectionIntentSchema, {
        profile: profileId,
        kind,
        reach: 'friends-of-friends',
        active: true
      })
    }
  }

  const toggleInterest = (tagId: string) => {
    setSelectedInterests((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Your matching profile</h2>
        <p className="text-sm text-muted-foreground">
          Opt in to be discoverable. Nothing is shared until you enable it. Your interests are
          curated from your own tags.
        </p>
      </header>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Headline
        </span>
        <input
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          placeholder="Building worker runtimes; into ambient music"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          About
        </span>
        <textarea
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          rows={3}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </label>

      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Interests
        </span>
        <div className="flex flex-wrap gap-1.5">
          {((tags ?? []) as unknown as Row[]).map((tag) => {
            const id = str(tag.id)
            if (!id) return null
            const active = selectedInterests.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleInterest(id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  active
                    ? 'border-accent bg-accent text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                }`}
              >
                {str(tag.name) ?? id}
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
        <div>
          <span className="text-sm font-medium">Discoverable</span>
          <p className="text-xs text-muted-foreground">Enable to appear in matching.</p>
        </div>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      </label>

      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Open to
        </span>
        <div className="flex flex-wrap gap-1.5">
          {connectionIntentKinds.map((kind) => {
            const active = myIntents.get(kind.id)?.active === true
            return (
              <button
                key={kind.id}
                type="button"
                disabled={!profileId}
                onClick={() => void toggleIntent(kind.id)}
                className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
                  active
                    ? 'border-accent bg-accent text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                }`}
              >
                {kind.name}
              </button>
            )
          })}
        </div>
        {!profileId && (
          <p className="text-xs text-muted-foreground">Save your profile first to choose intents.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
        >
          Save profile
        </button>
        {saved && <span className="text-xs text-muted-foreground">Saved ✓</span>}
      </div>
    </div>
  )
}
