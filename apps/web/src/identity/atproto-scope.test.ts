/**
 * Regression guard for exploration 0371 defect D1: the OAuth client asked for
 * `"scope": "atproto"` (identity only, no data access) while the ceremony
 * performed `com.atproto.repo.putRecord`. Nothing failed loudly — the write was
 * simply never authorised, and the binding was held by 0 DIDs network-wide.
 *
 * These tests tie the *declared* scope to the collection the ceremony actually
 * writes, so a rename on either side fails here rather than in production.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ATPROTO_BINDING_COLLECTION } from '@xnetjs/identity'
import { isScopeSyntaxRejection } from './atproto-ceremony'

// Resolved from the vitest root (the repo root) — this suite runs in the `dom`
// environment, where `import.meta.url` is not a file: URL.
const oauthDir = resolve(process.cwd(), 'site/public/oauth')

const readMetadata = (file: string) =>
  JSON.parse(readFileSync(resolve(oauthDir, file), 'utf8')) as {
    client_id: string
    scope: string
    redirect_uris: string[]
  }

const primary = readMetadata('atproto-client.json')
const compat = readMetadata('atproto-client-compat.json')

/** Actions a scope string grants over `collection`, per atproto.com/specs/permission. */
function grantedActions(scope: string, collection: string): Set<string> {
  const granted = new Set<string>()
  const ALL = ['create', 'update', 'delete']
  for (const token of scope.split(/\s+/).filter(Boolean)) {
    // The legacy escape hatch: broad repo write over every collection.
    if (token === 'transition:generic') {
      ALL.forEach((a) => granted.add(a))
      continue
    }
    if (!token.startsWith('repo:')) continue
    const [positional, query] = token.slice('repo:'.length).split('?')
    // Full wildcard is allowed; partial wildcards are not (no prefix matching).
    if (positional !== '*' && positional !== collection) continue
    if (!query) {
      ALL.forEach((a) => granted.add(a))
      continue
    }
    for (const [key, value] of new URLSearchParams(query)) {
      if (key === 'action') granted.add(value)
    }
  }
  return granted
}

describe('atproto OAuth scope covers the ceremony write path', () => {
  it('the primary client authorises putRecord on the binding collection', () => {
    const granted = grantedActions(primary.scope, ATPROTO_BINDING_COLLECTION)
    // putRecord both creates and updates, so both are required.
    expect(granted.has('create')).toBe(true)
    expect(granted.has('update')).toBe(true)
  })

  it('the compat client also authorises the write, via transition:generic', () => {
    const granted = grantedActions(compat.scope, ATPROTO_BINDING_COLLECTION)
    expect(granted.has('create')).toBe(true)
    expect(granted.has('update')).toBe(true)
  })

  it('both clients declare the mandatory `atproto` scope', () => {
    for (const metadata of [primary, compat]) {
      expect(metadata.scope.split(/\s+/)).toContain('atproto')
    }
  })

  it('bare `atproto` alone never satisfies the write — the original bug', () => {
    const granted = grantedActions('atproto', ATPROTO_BINDING_COLLECTION)
    expect(granted.size).toBe(0)
  })

  it('enumerates the collection exactly — granular scopes have no prefix matching', () => {
    // `repo:fyi.xnet.*` is invalid syntax that a PDS would reject, and it would
    // silently pass a naive startsWith() check, so assert it never appears.
    expect(primary.scope).toContain(ATPROTO_BINDING_COLLECTION)
    expect(primary.scope).not.toMatch(/repo:[^\s?]*\*[^\s]/)
  })

  it('keeps the compat client free of granular syntax, which is its whole point', () => {
    // Old PDSes reject `repo:` in client-metadata.json outright, so the compat
    // document must not contain it — otherwise the fallback fails identically.
    expect(compat.scope).not.toContain('repo:')
    expect(compat.client_id).not.toBe(primary.client_id)
  })

  it('the binding collection sits in a namespace we can actually claim', () => {
    // `net.x.*` requires control of x.net, which belongs to IANA (0371 D2).
    expect(ATPROTO_BINDING_COLLECTION.startsWith('fyi.xnet.')).toBe(true)
  })

  it('both clients share the redirect URI, so the fallback lands in the same app', () => {
    expect(compat.redirect_uris).toEqual(primary.redirect_uris)
  })
})

describe('scope-rejection detection gates the compat retry', () => {
  it('retries when the PDS rejects the scope syntax', () => {
    expect(isScopeSyntaxRejection(new Error('invalid_client_metadata: bad scope'))).toBe(true)
    expect(isScopeSyntaxRejection(new Error('Unsupported scope value: repo:'))).toBe(true)
  })

  it('does not retry on user cancellation or transport failure', () => {
    // Reopening a popup the user just dismissed would be worse than failing.
    expect(isScopeSyntaxRejection(new Error('The popup was closed by the user'))).toBe(false)
    expect(isScopeSyntaxRejection(new Error('Request aborted'))).toBe(false)
    expect(isScopeSyntaxRejection(new Error('NetworkError when fetching scope metadata'))).toBe(
      false
    )
    expect(isScopeSyntaxRejection(undefined)).toBe(false)
  })
})
