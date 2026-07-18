/**
 * BYO-OIDC inbound token verification (0338 Phase 3).
 */
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { describe, expect, it } from 'vitest'
import { verifyByoOidcToken } from '../src/services/byo-oidc'

const ISSUER = 'https://accounts.example-org.com'
const CLIENT_ID = 'xnet-hub-acme'

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const jwk = await exportJWK(publicKey)
  const getKey = async () => publicKey
  const sign = (claims: Record<string, unknown>, over: { iss?: string; aud?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(over.iss ?? ISSUER)
      .setAudience(over.aud ?? CLIENT_ID)
      .setSubject((claims.sub as string) ?? 'user-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
  return { getKey, sign, jwk }
}

describe('verifyByoOidcToken', () => {
  it('accepts a valid id_token and returns the subject to admit', async () => {
    const { getKey, sign } = await setup()
    const token = await sign({ sub: 'alice@acme.com', email: 'alice@acme.com' })
    const result = await verifyByoOidcToken({
      idToken: token,
      config: { issuer: ISSUER, clientId: CLIENT_ID },
      getKey
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.subject).toBe('alice@acme.com')
      expect(result.email).toBe('alice@acme.com')
    }
  })

  it('rejects a token from the wrong issuer', async () => {
    const { getKey, sign } = await setup()
    const token = await sign({ sub: 'x' }, { iss: 'https://evil.example.com' })
    const result = await verifyByoOidcToken({
      idToken: token,
      config: { issuer: ISSUER, clientId: CLIENT_ID },
      getKey
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a token for a different audience (client_id)', async () => {
    const { getKey, sign } = await setup()
    const token = await sign({ sub: 'x' }, { aud: 'some-other-client' })
    const result = await verifyByoOidcToken({
      idToken: token,
      config: { issuer: ISSUER, clientId: CLIENT_ID },
      getKey
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a token signed by a different key', async () => {
    const { sign } = await setup()
    const other = await setup()
    const token = await sign({ sub: 'x' })
    const result = await verifyByoOidcToken({
      idToken: token,
      config: { issuer: ISSUER, clientId: CLIENT_ID },
      getKey: other.getKey
    })
    expect(result.ok).toBe(false)
  })
})
