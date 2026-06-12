/**
 * ProfileSettings — the minimal profile editor (0167/0168 prerequisite).
 * One Profile node per DID; rosters, mention pills, and person properties
 * resolve DIDs through it.
 */
import { ProfileSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useEffect, useState } from 'react'
import { profileFormValues } from './comms-utils'

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

interface ProfileForm {
  name: string
  emoji: string
  message: string
}

function useProfileForm(profile: Record<string, unknown> | undefined): {
  form: ProfileForm
  setField: (field: keyof ProfileForm) => (value: string) => void
} {
  const [form, setForm] = useState<ProfileForm>({ name: '', emoji: '', message: '' })

  useEffect(() => {
    setForm(profileFormValues(profile))
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
  const profile = profiles?.[0] as unknown as Record<string, unknown> | undefined
  const { form, setField } = useProfileForm(profile)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    if (!bridge || !did) return
    const fields = {
      displayName: form.name.trim(),
      statusEmoji: form.emoji.trim(),
      statusMessage: form.message.trim()
    }
    if (profile) await bridge.update(String(profile.id), fields)
    else await bridge.create(ProfileSchema, { did: did as `did:key:${string}`, ...fields })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-base font-medium text-ink-1">Profile</h2>
        <p className="mt-1 text-xs text-ink-3">
          How you appear in rosters, mentions, and chats. Synced with your data.
        </p>
        <p className="mt-1 break-all font-mono text-[10px] text-ink-3">{did}</p>
      </div>
      <Field
        label="Display name"
        value={form.name}
        placeholder="Ada Lovelace"
        onChange={setField('name')}
      />
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
          disabled={!form.name.trim()}
          className="w-fit cursor-pointer rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-2 disabled:cursor-default disabled:opacity-50"
        >
          Save profile
        </button>
        <SavedFlash visible={saved} />
      </div>
    </div>
  )
}
