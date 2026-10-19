import type { CommunityData, Conversation } from './use-community-data'
import { ChannelSchema, SpaceMembershipSchema, spaceMembershipId } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { SocialActorSchema } from '@xnetjs/social'
import { Check, Copy, Link, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  audienceLabel,
  audienceDescription,
  conversationPlan,
  requireDid,
  socialProfileUrl,
  type Audience
} from './model'
import {
  Avatar,
  ExternalProfile,
  IconButton,
  Modal,
  inputClass,
  primaryButton,
  secondaryButton
} from './primitives'

export function CreateConversation({
  data,
  onClose,
  onOpen,
  initialKind = 'group',
  initialPerson = '',
  spaceId
}: {
  data: CommunityData
  onClose: () => void
  onOpen: (id: string) => void
  initialKind?: 'dm' | 'group' | 'community' | 'organization'
  spaceId?: string
  initialPerson?: string
}) {
  const [kind, setKind] = useState(initialKind)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [people, setPeople] = useState(initialPerson)
  const [audience, setAudience] = useState<Audience>('private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const create = async () => {
    setBusy(true)
    setError('')
    try {
      if (!data.did || !data.bridge?.get) throw new Error('Your identity is still loading.')
      const members = people
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(requireDid)
      if (spaceId) {
        const channel = await data.bridge.create(ChannelSchema, {
          name: name.trim(),
          kind: 'channel',
          space: spaceId,
          members: [
            ...new Set(
              data.members
                .filter((member) => member.space === spaceId)
                .flatMap((member) => (member.member ? [member.member] : []))
            )
          ],
          topic: description,
          visibility: 'inherit'
        })
        onOpen(channel.id)
      } else {
        const plan = conversationPlan({
          name,
          description,
          members,
          me: data.did,
          kind,
          audience,
          id: crypto.randomUUID()
        })
        const existing = await data.bridge.get(plan.channelId)
        if (!existing) {
          const result = await data.mutation.mutate(plan.operations)
          if (!result) throw new Error('The conversation could not be saved. Please try again.')
        }
        onOpen(plan.channelId)
      }
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={spaceId ? 'New channel' : 'Start a conversation'} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        {!spaceId && (
          <div className="grid grid-cols-2 gap-2">
            {(['dm', 'group', 'community', 'organization'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={`${secondaryButton} ${kind === value ? 'border-foreground bg-muted font-semibold' : ''}`}
              >
                {
                  {
                    dm: 'Direct message',
                    group: 'Group conversation',
                    community: 'Community',
                    organization: 'Organization'
                  }[value]
                }
              </button>
            ))}
          </div>
        )}
        <label className="block space-y-2 text-sm font-medium">
          {kind === 'dm' ? 'Conversation name' : 'Name'}
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              spaceId ? 'weekend-plans' : kind === 'dm' ? 'Alex Chen' : 'A place for your people'
            }
            className={inputClass}
          />
        </label>
        {kind !== 'dm' && (
          <label className="block space-y-2 text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What brings you together?"
              className={inputClass}
            />
          </label>
        )}
        {!spaceId && (
          <label className="block space-y-2 text-sm font-medium">
            {kind === 'dm' ? 'Their xNet identity' : 'Invite people'}
            <textarea
              required={kind === 'dm'}
              rows={2}
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              placeholder="Paste did:key:… identities, separated by commas"
              className={inputClass}
            />
            <span className="block text-xs font-normal leading-5 text-muted-foreground">
              People can copy their identity from their profile.{' '}
              {kind !== 'dm' && 'You can invite more people later.'}
            </span>
          </label>
        )}
        {!spaceId && kind !== 'dm' && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Who can read?</legend>
            <div className="flex gap-2">
              {(['private', 'unlisted', 'public'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={audience === value}
                  onClick={() => setAudience(value)}
                  className={`${secondaryButton} flex-1 ${audience === value ? 'border-foreground font-semibold' : ''}`}
                >
                  {audienceLabel[value]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {audienceDescription[audience]}
            </p>
          </fieldset>
        )}
        {spaceId && (
          <p className="text-sm leading-6 text-muted-foreground">
            This channel shares the community’s audience. Create a separate group conversation for a
            smaller private circle.
          </p>
        )}
        <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
          This redesign is an experimental preview. Messages and attachments are not yet end-to-end
          encrypted, and the full private-community security model is pending. Use non-sensitive
          content.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button disabled={busy || !name.trim()} className={`${primaryButton} w-full`}>
          {busy ? 'Creating…' : spaceId ? 'Create channel' : 'Create conversation'}
          <Plus size={16} />
        </button>
      </form>
    </Modal>
  )
}

export function ProfileDialog({ data, onClose }: { data: CommunityData; onClose: () => void }) {
  const { data: actors } = useQuery(SocialActorSchema, { where: { isSelf: true }, limit: 100 })
  const [name, setName] = useState(
    data.profiles.find((profile) => profile.did === data.did)?.displayName ?? ''
  )
  const [provider, setProvider] = useState<'bluesky' | 'twitter'>('bluesky')
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await action()
      setStatus(success)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const links = actors.filter(
    (actor) => actor.createdBy === data.did && actor.observedBy === data.did && actor.profileUrl
  )
  return (
    <Modal title="Your profile" onClose={onClose}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar name={name || 'You'} large />
          <div>
            <h3 className="font-semibold">Make yourself at home</h3>
            <p className="mt-1 text-sm text-muted-foreground">A name your people will recognize.</p>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => data.saveProfile(name.trim()), 'Profile saved.')
          }}
          className="flex items-end gap-2"
        >
          <label className="flex-1 space-y-2 text-sm">
            Display name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>
          <button disabled={busy || !name.trim()} className={primaryButton}>
            Save
          </button>
        </form>
        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Your xNet identity</p>
            <IconButton
              label="Copy your identity"
              onClick={() =>
                void run(() => navigator.clipboard.writeText(data.did ?? ''), 'Identity copied.')
              }
            >
              <Copy size={16} />
            </IconButton>
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">{data.did}</p>
        </div>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Social profiles</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Add links to your Bluesky and X profiles. These are self-declared links, not verified
            sign-in credentials. They do not import messages or grant access to your communities.
          </p>
          {links.map((actor) => (
            <div
              key={actor.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {actor.platform === 'atproto' ? 'Bluesky' : 'X / Twitter'} · Unverified
                </p>
                <ExternalProfile url={actor.profileUrl!}>@{actor.handle}</ExternalProfile>
              </div>
              <IconButton
                label={`Remove ${actor.handle}`}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!data.bridge?.get) throw new Error('Store unavailable')
                    await data.bridge.delete(actor.id)
                  }, 'Profile link removed.')
                }
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                if (!data.bridge?.get || !data.did) throw new Error('Store unavailable')
                const link = socialProfileUrl(provider, handle)
                const id = `social-profile-${data.did}-${provider}`
                const fields = {
                  platform: provider === 'bluesky' ? ('atproto' as const) : ('x' as const),
                  actorKind: 'person' as const,
                  isSelf: true,
                  observedBy: data.did,
                  handle: link.handle,
                  profileUrl: link.url,
                  visibility: 'private' as const,
                  privacyClass: 'public' as const
                }
                if (await data.bridge.get(id)) await data.bridge.update(id, fields)
                else await data.bridge.create(SocialActorSchema, fields, id)
                setHandle('')
              }, 'Profile link saved.')
            }}
            className="space-y-2"
          >
            <div className="flex gap-2">
              <select
                aria-label="Social network"
                value={provider}
                onChange={(event) => setProvider(event.target.value as 'bluesky' | 'twitter')}
                className={`${inputClass} !w-32`}
              >
                <option value="bluesky">Bluesky</option>
                <option value="twitter">X / Twitter</option>
              </select>
              <input
                aria-label="Social handle or profile URL"
                required
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder={provider === 'bluesky' ? 'you.bsky.social' : '@you'}
                className={inputClass}
              />
            </div>
            <button disabled={busy || !handle.trim()} className={secondaryButton}>
              <Link size={15} />
              Add profile link
            </button>
          </form>
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Check size={16} />
            {status}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function InviteDialog({
  data,
  channel,
  onClose
}: {
  data: CommunityData
  channel: Conversation
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Invite a person" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          void (async () => {
            if (!data.bridge?.get || !data.did || !channel.space)
              throw new Error('This conversation has no community to manage.')
            const member = requireDid(value)
            const space = data.spaces.find((entry) => entry.id === channel.space)
            if (space?.createdBy !== data.did && !space?.owners?.includes(data.did))
              throw new Error('Only a community owner can invite people here.')
            const id = spaceMembershipId(channel.space, member)
            if (!(await data.bridge.get(id)))
              await data.bridge.create(
                SpaceMembershipSchema,
                {
                  space: channel.space,
                  member,
                  role: 'member',
                  addedBy: data.did,
                  addedAt: Date.now()
                },
                id
              )
            await data.bridge.update(channel.id, {
              members: [...new Set([...(channel.members ?? []), member])]
            })
            onClose()
          })()
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : String(cause))
            )
            .finally(() => setBusy(false))
        }}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          This person will be a member of the whole community, including its existing channels and
          history. Use a separate group for a smaller audience.
        </p>
        <label className="block space-y-2 text-sm">
          Their xNet identity
          <input
            autoFocus
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="did:key:z…"
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button disabled={busy} className={`${primaryButton} w-full`}>
          {busy ? 'Inviting…' : 'Add community member'}
        </button>
      </form>
    </Modal>
  )
}
