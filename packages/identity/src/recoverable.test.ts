import { bytesToHex } from '@xnetjs/crypto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RECOVERY_PHRASE_WORDS,
  MIN_RECOVERY_PHRASE_WORDS,
  createRecoverableIdentity,
  didForRecoveryPhrase,
  generateRecoveryPhrase,
  openRecoveryPhrase,
  recoveryPhraseToBundle,
  sealRecoveryPhrase,
  validateRecoveryPhrase
} from './recoverable'
import { RECOVERY_WORDLIST } from './seed-recovery'

describe('generateRecoveryPhrase', () => {
  it('generates a 24-word phrase from the wordlist by default', () => {
    const phrase = generateRecoveryPhrase()
    const words = phrase.split(' ')
    expect(words).toHaveLength(DEFAULT_RECOVERY_PHRASE_WORDS)
    const known = new Set(RECOVERY_WORDLIST)
    expect(words.every((w) => known.has(w))).toBe(true)
    expect(validateRecoveryPhrase(phrase).ok).toBe(true)
  })

  it('honors a custom word count and refuses fewer than the minimum', () => {
    expect(generateRecoveryPhrase(12).split(' ')).toHaveLength(12)
    expect(() => generateRecoveryPhrase(MIN_RECOVERY_PHRASE_WORDS - 1)).toThrow()
  })

  it('does not produce the same phrase twice', () => {
    expect(generateRecoveryPhrase()).not.toBe(generateRecoveryPhrase())
  })
})

describe('validateRecoveryPhrase', () => {
  it('accepts a valid phrase and normalizes casing/whitespace', () => {
    const result = validateRecoveryPhrase(
      '  Amber   anchor   apple  arch arrow atlas autumn beacon birch bloom brave breeze  '
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.words).toHaveLength(12)
  })

  it('rejects a too-short phrase with the word count', () => {
    const result = validateRecoveryPhrase('amber anchor apple')
    expect(result).toEqual({ ok: false, reason: 'too-short', wordCount: 3 })
  })

  it('flags unknown (typo) words', () => {
    const phrase = `${RECOVERY_WORDLIST.slice(0, 11).join(' ')} notaword`
    const result = validateRecoveryPhrase(phrase)
    expect(result.ok).toBe(false)
    if (!result.ok && result.reason === 'unknown-words') {
      expect(result.unknownWords).toEqual(['notaword'])
    } else {
      throw new Error('expected unknown-words')
    }
  })
})

describe('recoveryPhraseToBundle / didForRecoveryPhrase', () => {
  it('is deterministic: the same phrase yields the same DID and X25519 key on any device', () => {
    const phrase = generateRecoveryPhrase()
    const a = recoveryPhraseToBundle(phrase)
    const b = recoveryPhraseToBundle(phrase)
    expect(a.identity.did).toBe(b.identity.did)
    // The X25519 encryption key gates data decryption — it MUST be reproducible.
    expect(bytesToHex(a.encryptionKey)).toBe(bytesToHex(b.encryptionKey))
    expect(bytesToHex(a.signingKey)).toBe(bytesToHex(b.signingKey))
  })

  it('matches didForRecoveryPhrase and ignores casing/whitespace', () => {
    const phrase = generateRecoveryPhrase(12)
    expect(didForRecoveryPhrase(phrase)).toBe(recoveryPhraseToBundle(phrase).identity.did)
    expect(didForRecoveryPhrase(`  ${phrase.toUpperCase()}  `)).toBe(didForRecoveryPhrase(phrase))
  })

  it('gives different phrases different DIDs', () => {
    expect(didForRecoveryPhrase(generateRecoveryPhrase())).not.toBe(
      didForRecoveryPhrase(generateRecoveryPhrase())
    )
  })
})

describe('createRecoverableIdentity', () => {
  it('returns a valid phrase whose DID matches its bundle (round-trips on import)', () => {
    const { phrase, bundle } = createRecoverableIdentity()
    expect(validateRecoveryPhrase(phrase).ok).toBe(true)
    expect(bundle.identity.did).toBe(didForRecoveryPhrase(phrase))
    // Re-importing the phrase on a "new device" reproduces the same identity.
    expect(recoveryPhraseToBundle(phrase).identity.did).toBe(bundle.identity.did)
  })
})

describe('sealRecoveryPhrase / openRecoveryPhrase', () => {
  const key = new Uint8Array(32).fill(7)

  it('round-trips a sealed phrase with the right key', () => {
    const phrase = generateRecoveryPhrase()
    const sealed = sealRecoveryPhrase(phrase, key)
    expect(sealed.ciphertext).not.toEqual(new TextEncoder().encode(phrase))
    expect(openRecoveryPhrase(sealed, key)).toBe(phrase.toLowerCase())
  })

  it('fails to open with the wrong key', () => {
    const sealed = sealRecoveryPhrase(generateRecoveryPhrase(), key)
    const wrong = new Uint8Array(32).fill(9)
    expect(() => openRecoveryPhrase(sealed, wrong)).toThrow()
  })
})
