import type { PendingInvitation, DesktopSocialIdentity } from '../../shared/onboarding'
import type { SafeStorageLike } from '../secure-seed'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { decodeInvite, encodeInvite } from '../peers/protocol'

type SavedInvitation = { id: string; link: string; receivedAt: number }
type State = {
  version: 1
  complete: boolean
  invitations: SavedInvitation[]
  socialIdentity?: DesktopSocialIdentity
}
const MAX_INVITATIONS = 8

/** One writer in main. The invite is a capability: never persist it in plaintext. */
export class OnboardingStore {
  private state: State
  private readonly path: string
  constructor(
    private readonly directory: string,
    private readonly storage: SafeStorageLike,
    existingWorkspace: boolean
  ) {
    this.path = join(directory, 'onboarding.json')
    let raw: string
    try {
      if (statSync(this.path).size > 256 * 1024)
        throw new Error('The onboarding file is too large.')
      raw = readFileSync(this.path, 'utf8')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      this.state = { version: 1, complete: existingWorkspace, invitations: [] }
      this.persist(this.state)
      return
    }
    const file = JSON.parse(raw) as { version?: unknown; encrypted?: unknown; data?: unknown }
    if (file.version !== 1 || typeof file.encrypted !== 'boolean' || typeof file.data !== 'string')
      throw new Error('Desktop setup is unreadable. Restore a backup; your identity was not reset.')
    if (file.encrypted && !storage.isEncryptionAvailable())
      throw new Error('Unlock the platform key store to recover your saved invitations.')
    const state = JSON.parse(
      file.encrypted ? storage.decryptString(Buffer.from(file.data, 'base64')) : file.data
    ) as State
    if (
      state?.version !== 1 ||
      typeof state.complete !== 'boolean' ||
      !Array.isArray(state.invitations) ||
      state.invitations.length > MAX_INVITATIONS ||
      (!file.encrypted && state.invitations.length > 0)
    )
      throw new Error('Desktop setup is unreadable. Your saved invitations were not reset.')
    const ids = new Set<string>()
    if (state.socialIdentity) validateSocialIdentity(state.socialIdentity)
    for (const entry of state.invitations) {
      if (
        !entry ||
        !Number.isSafeInteger(entry.receivedAt) ||
        entry.receivedAt <= 0 ||
        entry.receivedAt > Date.now() + 60_000 ||
        typeof entry.link !== 'string' ||
        entry.id !== this.id(entry.link) ||
        ids.has(entry.id)
      )
        throw new Error('A saved invitation is unreadable.')
      // Validate at receipt time so an expired invitation can still explain what happened.
      decodeInvite(entry.link, entry.receivedAt)
      ids.add(entry.id)
    }
    this.state = state
  }
  private id(link: string): string {
    return createHash('sha256').update(link).digest('hex')
  }
  private persist(next: State): void {
    const encrypted = this.storage.isEncryptionAvailable()
    if (!encrypted && next.invitations.length)
      throw new Error(
        'Unlock your system key store before saving this invitation. The link was not saved.'
      )
    const data = JSON.stringify(next)
    const file = JSON.stringify({
      version: 1,
      encrypted,
      data: encrypted ? this.storage.encryptString(data).toString('base64') : data
    })
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporary, 'wx', 0o600)
      try {
        writeFileSync(fd, file)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(temporary, this.path)
      const directory = openSync(this.directory, 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    } finally {
      rmSync(temporary, { force: true })
    }
    this.state = next
  }
  snapshot(): {
    complete: boolean
    invitations: PendingInvitation[]
    socialIdentity?: DesktopSocialIdentity
  } {
    return {
      complete: this.state.complete,
      ...(this.state.socialIdentity ? { socialIdentity: { ...this.state.socialIdentity } } : {}),
      invitations: this.state.invitations.map(({ id, link, receivedAt }) => {
        const { channel, name, binding, expires, group, access } = decodeInvite(link, receivedAt)
        return {
          id,
          channel: group?.id ?? channel,
          name,
          did: binding.did,
          expires,
          access: access === 'public' ? 'public' : access === 'approval' ? 'approval' : 'invite',
          kind: group ? ('group' as const) : ('direct' as const)
        }
      })
    }
  }
  saveInvitation(raw: string, now = Date.now()): void {
    const link = encodeInvite(decodeInvite(raw, now))
    const id = this.id(link)
    if (this.state.invitations.some((entry) => entry.id === id)) return
    if (this.state.invitations.length >= MAX_INVITATIONS)
      throw new Error(
        'You have eight saved invitations. Review or remove one before adding another.'
      )
    this.persist({
      ...this.state,
      invitations: [...this.state.invitations, { id, link, receivedAt: now }]
    })
  }
  invitation(id: string): string {
    const entry = this.state.invitations.find((candidate) => candidate.id === id)
    if (!entry) throw new Error('This invitation is no longer saved.')
    return entry.link
  }
  dismissInvitation(id: string): void {
    this.persist({
      ...this.state,
      invitations: this.state.invitations.filter((entry) => entry.id !== id)
    })
  }
  complete(): void {
    this.persist({ ...this.state, complete: true })
  }
  linkIdentity(identity: DesktopSocialIdentity): void {
    validateSocialIdentity(identity)
    if (this.state.socialIdentity && this.state.socialIdentity.subject !== identity.subject)
      throw new Error(
        'Disconnect the linked Bluesky account before connecting a different account.'
      )
    this.persist({ ...this.state, socialIdentity: { ...identity } })
  }
  unlinkIdentity(): void {
    this.persist({ ...this.state, socialIdentity: undefined })
  }
}

function validateSocialIdentity(value: DesktopSocialIdentity): void {
  if (
    value.provider !== 'bluesky' ||
    typeof value.subject !== 'string' ||
    !/^did:(plc|web):[^\s]{1,250}$/.test(value.subject) ||
    typeof value.handle !== 'string' ||
    value.handle.length > 253 ||
    typeof value.displayName !== 'string' ||
    value.displayName.length > 120 ||
    !Number.isSafeInteger(value.verifiedAt) ||
    value.verifiedAt <= 0
  )
    throw new Error('The saved social identity is invalid.')
}
