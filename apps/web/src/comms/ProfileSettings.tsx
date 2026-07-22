/**
 * ProfileSettings — the minimal profile editor (0167/0168 prerequisite).
 * One Profile node per DID; rosters, mention pills, and person properties
 * resolve DIDs through it. The canonical node lives at the deterministic
 * `profileNodeId(did)` so share recipients can acquire it by DID alone.
 */
import { ProfileSchema, profileNodeId } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { DIDAvatar } from '@xnetjs/ui'
import { useEffect, useRef, useState } from 'react'
import { imageToAvatarDataUrl } from './avatar-image'
import { isHandleTaken, normalizeHandle, profileFormValues, safeAvatarSrc } from './comms-utils'
import { useProfiles } from './hooks'
import { configuredHubUrl } from '../lib/hub-url'
import { VerifiedHandle } from '../identity/VerifiedHandle'

/** The hub's HTTPS base (the verifier endpoint), derived from the ws hub URL. */
function atprotoHubHttpUrl(): string | undefined {
  const ws = configuredHubUrl()
  if (!ws) return undefined
  return ws.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
}

function Field({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full max-w-md rounded-md border border-hairline bg-surface-0 px-2 text-sm text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
      />
    </label>
  )
}

function SavedFlash({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <span className="text-xs text-ink-3">Saved ✓</span>
}

/** Avatar picker: current picture (or the DID identicon) + upload/remove. */
function AvatarField({
  did,
  avatar,
  onChange
}: {
  did: string
  avatar: string
  onChange: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const src = safeAvatarSrc(avatar)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await imageToAvatarDataUrl(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be used.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Picture</span>
      <div className="flex items-center gap-3">
        {src ? (
          <img src={src} alt="Your avatar" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <DIDAvatar did={did} size={56} />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-2 disabled:cursor-default disabled:opacity-50"
          >
            {busy ? 'Processing…' : src ? 'Change picture' : 'Upload picture'}
          </button>
          {src && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="cursor-pointer rounded-md border-none bg-transparent px-2 py-1.5 text-xs text-ink-3 hover:text-ink-1"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void pick(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      <span className="text-[11px] text-ink-3">
        {error ??
          'Without a picture, your generated avatar is shown. Anyone you collaborate or share with can see your profile.'}
      </span>
    </div>
  )
}

interface ProfileForm {
  name: string
  handle: string
  emoji: string
  message: string
  avatar: string
}

function useProfileForm(profile: Record<string, unknown> | undefined): {
  form: ProfileForm
  setField: (field: keyof ProfileForm) => (value: string) => void
} {
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    handle: '',
    emoji: '',
    message: '',
    avatar: ''
  })

  useEffect(() => {
    setForm({
      ...profileFormValues(profile),
      avatar: (profile?.avatar as string | undefined) ?? ''
    })
  }, [profile])

  const setField = (field: keyof ProfileForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  return { form, setField }
}

export function ProfileSettings() {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const did = authorDID ?? ''
  const { data: profiles } = useQuery(ProfileSchema, {
    where: { did: did as `did:key:${string}` }
  })
  // Prefer the canonical deterministic node; fall back to a legacy
  // random-ID node (pre-migration) so its values seed the form.
  const canonicalId = did ? profileNodeId(did) : ''
  const nodes = (profiles ?? []) as unknown as Array<Record<string, unknown>>
  const profile = nodes.find((p) => String(p.id) === canonicalId) ?? nodes[0]
  const { form, setField } = useProfileForm(profile)
  const [saved, setSaved] = useState(false)
  const allProfiles = useProfiles()

  const normalizedHandle = normalizeHandle(form.handle)
  const handleTaken = isHandleTaken(normalizedHandle, did, allProfiles)

  const save = async () => {
    if (!bridge || !did || handleTaken) return
    const fields = {
      displayName: form.name.trim(),
      // Store the normalized slug; the DID stays the canonical reference.
      handle: normalizedHandle,
      statusEmoji: form.emoji.trim(),
      statusMessage: form.message.trim(),
      avatar: form.avatar
    }
    // Always land on the deterministic node ID — a legacy random-ID node is
    // superseded (dedupeProfiles: newest per DID wins) rather than updated.
    if (profile && String(profile.id) === canonicalId) {
      await bridge.update(canonicalId, fields)
    } else {
      await bridge.create(
        ProfileSchema,
        { did: did as `did:key:${string}`, ...fields },
        canonicalId
      )
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-base font-medium text-ink-1">Profile</h2>
        <p className="mt-1 text-xs text-ink-3">
          How you appear in rosters, mentions, and chats. Synced with your data, and visible to
          people you share with.
        </p>
        <p className="mt-1 break-all font-mono text-[10px] text-ink-3">{did}</p>
      </div>
      <AvatarField did={did} avatar={form.avatar} onChange={setField('avatar')} />
      <Field
        label="Display name"
        value={form.name}
        placeholder="Ada Lovelace"
        onChange={setField('name')}
      />
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Handle</span>
        <div className="flex items-center gap-1">
          <span className="text-sm text-ink-3">@</span>
          <input
            type="text"
            value={form.handle}
            placeholder="ada"
            onChange={(event) => setField('handle')(event.target.value)}
            className="h-8 w-full max-w-md rounded-md border border-hairline bg-surface-0 px-2 text-sm text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
          />
        </div>
        {handleTaken ? (
          <span className="text-[11px] text-red-500">@{normalizedHandle} is already taken</span>
        ) : (
          <span className="text-[11px] text-ink-3">
            Lets people type @{normalizedHandle || 'you'} to mention you. Unique in this workspace.
          </span>
        )}
      </label>
      {typeof profile?.atprotoHandle === 'string' && profile.atprotoHandle && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
            Global identity
          </span>
          <VerifiedHandle
            // Cast at the untyped-storage boundary: atprotoDid is a text()
            // field, did is a native did:key. VerifiedHandle re-validates the
            // foreign DID before it ever reaches the hub (F2, 0389).
            atprotoDid={String(profile.atprotoDid ?? '') as `did:web:${string}`}
            atprotoHandle={String(profile.atprotoHandle)}
            xnetDid={did as `did:key:${string}`}
            hubHttpUrl={atprotoHubHttpUrl()}
          />
        </div>
      )}
      <Field
        label="Status emoji"
        value={form.emoji}
        placeholder="🌴"
        onChange={setField('emoji')}
      />
      <Field
        label="Status message"
        value={form.message}
        placeholder="Out until Monday"
        onChange={setField('message')}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!form.name.trim() || handleTaken}
          className="w-fit cursor-pointer rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-2 disabled:cursor-default disabled:opacity-50"
        >
          Save profile
        </button>
        <SavedFlash visible={saved} />
      </div>
    </div>
  )
}
