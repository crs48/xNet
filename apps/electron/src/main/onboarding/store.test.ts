import type { SafeStorageLike } from '../secure-seed'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBinding, encodeInvite } from '../peers/protocol'
import { OnboardingStore } from './store'

const directories: string[] = []
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), 'xnet-onboarding-'))
  directories.push(path)
  return path
}
const secure: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`protected:${value}`),
  decryptString: (value) => {
    const text = value.toString()
    if (!text.startsWith('protected:')) throw new Error('Key store cannot read this file')
    return text.slice('protected:'.length)
  }
}
const unavailable: SafeStorageLike = { ...secure, isEncryptionAvailable: () => false }
const invitation = (name = 'Our conversation', expires = Date.now() + 60_000) =>
  encodeInvite({
    version: 1,
    name,
    channel: `iroh-${randomUUID()}`,
    secret: 'c'.repeat(64),
    binding: createBinding(new Uint8Array(32).fill(7), 'a'.repeat(64)),
    ticket: 'validated-by-the-peer-service-before-connecting',
    expires
  })
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('durable desktop onboarding', () => {
  it('keeps verified identities through restart without silently replacing an existing account', () => {
    const path = directory()
    const store = new OnboardingStore(path, secure, false)
    store.saveInvitation(invitation())
    const identity = {
      provider: 'bluesky' as const,
      subject: 'did:plc:alice',
      handle: 'alice.test',
      displayName: 'Alice',
      verifiedAt: Date.now()
    }
    store.linkIdentity(identity)
    const restored = new OnboardingStore(path, secure, false)
    expect(restored.snapshot().socialIdentity).toEqual(identity)
    expect(restored.snapshot().invitations).toHaveLength(1)
    expect(() => restored.linkIdentity({ ...identity, subject: 'did:plc:other' })).toThrow(
      'Disconnect'
    )
    restored.unlinkIdentity()
    expect(new OnboardingStore(path, secure, false).snapshot().socialIdentity).toBeUndefined()
    expect(restored.snapshot().invitations).toHaveLength(1)
  })
  it('resumes a new workspace after database creation without mistaking it for an existing install', () => {
    const path = directory()
    const first = new OnboardingStore(path, secure, false)
    first.saveInvitation(invitation())
    const second = new OnboardingStore(path, secure, true)
    expect(second.snapshot().complete).toBe(false)
    expect(second.snapshot().invitations).toEqual(first.snapshot().invitations)
    second.complete()
    expect(new OnboardingStore(path, secure, true).snapshot().complete).toBe(true)
  })
  it('keeps existing workspaces out of forced first-run setup', () => {
    expect(new OnboardingStore(directory(), secure, true).snapshot().complete).toBe(true)
  })
  it('keeps several invitations in order, deduplicates redelivery, and removes only the selected one', () => {
    const path = directory()
    const store = new OnboardingStore(path, secure, false)
    const first = invitation('Friends')
    const second = invitation('Collaborators')
    store.saveInvitation(first)
    store.saveInvitation(second)
    store.saveInvitation('  ' + first + '\n')
    expect(store.snapshot().invitations.map((entry) => entry.name)).toEqual([
      'Friends',
      'Collaborators'
    ])
    store.dismissInvitation(store.snapshot().invitations[0].id)
    expect(
      new OnboardingStore(path, secure, true).snapshot().invitations.map((entry) => entry.name)
    ).toEqual(['Collaborators'])
  })
  it('persists invitation capabilities only through the key store and restricts file access', () => {
    const path = directory()
    const store = new OnboardingStore(path, secure, false)
    const link = invitation()
    store.saveInvitation(link)
    const raw = readFileSync(join(path, 'onboarding.json'), 'utf8')
    expect(JSON.parse(raw).encrypted).toBe(true)
    expect(raw).not.toContain(link)
    expect(raw).not.toContain('c'.repeat(64))
    expect(statSync(join(path, 'onboarding.json')).mode & 0o777).toBe(0o600)
    const id = store.snapshot().invitations[0].id
    expect(new OnboardingStore(path, secure, false).invitation(id)).toBe(link)
  })
  it('allows name-only setup without a key store but refuses to save invite secrets', () => {
    const path = directory()
    const store = new OnboardingStore(path, unavailable, false)
    store.complete()
    expect(() => store.saveInvitation(invitation())).toThrow('key store')
    expect(store.snapshot()).toEqual({ complete: true, invitations: [] })
    expect(new OnboardingStore(path, unavailable, false).snapshot()).toEqual(store.snapshot())
  })
  it('does not overwrite state when encryption fails', () => {
    const path = directory()
    let fail = false
    const storage = {
      ...secure,
      encryptString: (value: string) => {
        if (fail) throw new Error('Key store locked')
        return secure.encryptString(value)
      }
    }
    const store = new OnboardingStore(path, storage, false)
    const before = readFileSync(join(path, 'onboarding.json'), 'utf8')
    fail = true
    expect(() => store.saveInvitation(invitation())).toThrow('Key store locked')
    expect(store.snapshot().invitations).toEqual([])
    expect(readFileSync(join(path, 'onboarding.json'), 'utf8')).toBe(before)
  })
  it('retains expired destinations for explanation but rejects new expired or malformed links', () => {
    const path = directory()
    const store = new OnboardingStore(path, secure, false)
    const receivedAt = Date.now() - 120_000
    const link = invitation('Expired destination', receivedAt + 60_000)
    store.saveInvitation(link, receivedAt)
    const restored = new OnboardingStore(path, secure, false)
    expect(restored.snapshot().invitations[0].name).toBe('Expired destination')
    expect(restored.snapshot().invitations[0].expires).toBeLessThan(Date.now())
    expect(() => restored.saveInvitation(link)).toThrow('expired')
    expect(() => restored.saveInvitation('https://example.com')).toThrow()
  })
  it('bounds queued links without evicting an earlier invitation', () => {
    const store = new OnboardingStore(directory(), secure, false)
    for (let i = 0; i < 8; i++) store.saveInvitation(invitation(String(i)))
    expect(() => store.saveInvitation(invitation('overflow'))).toThrow('eight saved invitations')
    expect(store.snapshot().invitations.map((entry) => entry.name)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7'
    ])
  })
  it('fails closed on corrupt or locked storage instead of treating it as first launch', () => {
    const path = directory()
    new OnboardingStore(path, secure, true)
    expect(() => new OnboardingStore(path, unavailable, false)).toThrow('Unlock')
    writeFileSync(join(path, 'onboarding.json'), '{broken')
    expect(() => new OnboardingStore(path, secure, false)).toThrow()
    expect(readFileSync(join(path, 'onboarding.json'), 'utf8')).toBe('{broken')
  })
  it('rejects a plaintext envelope containing capabilities', () => {
    const path = directory()
    writeFileSync(
      join(path, 'onboarding.json'),
      JSON.stringify({
        version: 1,
        encrypted: false,
        data: JSON.stringify({ version: 1, complete: false, invitations: [{ link: invitation() }] })
      })
    )
    expect(() => new OnboardingStore(path, secure, false)).toThrow('unreadable')
  })
})
