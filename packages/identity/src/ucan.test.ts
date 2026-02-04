import type { UCANToken } from './types'
import { describe, expect, it } from 'vitest'
import { generateIdentity } from './did'
import { createUCAN, hasCapability, isExpired, verifyUCAN } from './ucan'

describe('UCAN', () => {
  describe('createUCAN and verifyUCAN', () => {
    it('should create and verify UCAN', () => {
      const { identity: issuer, privateKey } = generateIdentity()
      const { identity: audience } = generateIdentity()

      const token = createUCAN({
        issuer: issuer.did,
        issuerKey: privateKey,
        audience: audience.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'write' }]
      })

      const result = verifyUCAN(token)
      expect(result.valid).toBe(true)
      expect(result.payload?.iss).toBe(issuer.did)
      expect(result.payload?.aud).toBe(audience.did)
    })

    it('should reject expired UCAN', () => {
      const { identity: issuer, privateKey } = generateIdentity()
      const { identity: audience } = generateIdentity()

      const token = createUCAN({
        issuer: issuer.did,
        issuerKey: privateKey,
        audience: audience.did,
        capabilities: [],
        expiration: Math.floor(Date.now() / 1000) - 100 // Already expired
      })

      const result = verifyUCAN(token)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('should reject tampered token', () => {
      const { identity: issuer, privateKey } = generateIdentity()
      const { identity: audience } = generateIdentity()

      const token = createUCAN({
        issuer: issuer.did,
        issuerKey: privateKey,
        audience: audience.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'read' }]
      })

      // Tamper with the token by modifying the payload
      const parts = token.split('.')
      const tamperedPayload = btoa(
        JSON.stringify({
          iss: issuer.did,
          aud: audience.did,
          exp: Math.floor(Date.now() / 1000) + 3600,
          att: [{ with: 'xnet://doc/456', can: 'admin' }], // Changed!
          prf: []
        })
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`
      const result = verifyUCAN(tamperedToken)
      expect(result.valid).toBe(false)
    })

    it('should include proofs', () => {
      const { identity: issuer, privateKey } = generateIdentity()
      const { identity: audience } = generateIdentity()

      const proofToken = 'parent.token.here'
      const token = createUCAN({
        issuer: issuer.did,
        issuerKey: privateKey,
        audience: audience.did,
        capabilities: [],
        proofs: [proofToken]
      })

      const result = verifyUCAN(token)
      expect(result.valid).toBe(true)
      expect(result.payload?.prf).toContain(proofToken)
    })

    it('should validate proof chain and attenuation', () => {
      const { identity: delegator, privateKey: delegatorKey } = generateIdentity()
      const { identity: delegate, privateKey: delegateKey } = generateIdentity()
      const { identity: audience } = generateIdentity()

      const parent = createUCAN({
        issuer: delegator.did,
        issuerKey: delegatorKey,
        audience: delegate.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'write' }]
      })

      const child = createUCAN({
        issuer: delegate.did,
        issuerKey: delegateKey,
        audience: audience.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'write' }],
        proofs: [parent]
      })

      const childResult = verifyUCAN(child)
      expect(childResult.valid).toBe(true)

      const invalidChild = createUCAN({
        issuer: delegate.did,
        issuerKey: delegateKey,
        audience: audience.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'admin' }],
        proofs: [parent]
      })

      const invalidResult = verifyUCAN(invalidChild)
      expect(invalidResult.valid).toBe(false)
    })

    it('should reject proofs with shorter expiry', () => {
      const now = Math.floor(Date.now() / 1000)
      const { identity: delegator, privateKey: delegatorKey } = generateIdentity()
      const { identity: delegate, privateKey: delegateKey } = generateIdentity()
      const { identity: audience } = generateIdentity()

      const parent = createUCAN({
        issuer: delegator.did,
        issuerKey: delegatorKey,
        audience: delegate.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'write' }],
        expiration: now + 300
      })

      const child = createUCAN({
        issuer: delegate.did,
        issuerKey: delegateKey,
        audience: audience.did,
        capabilities: [{ with: 'xnet://doc/123', can: 'write' }],
        proofs: [parent],
        expiration: now + 600
      })

      const result = verifyUCAN(child)
      expect(result.valid).toBe(false)
    })
  })

  describe('hasCapability', () => {
    const mockToken: UCANToken = {
      iss: 'did:key:test',
      aud: 'did:key:test2',
      exp: Math.floor(Date.now() / 1000) + 3600,
      att: [
        { with: 'xnet://doc/123', can: 'write' },
        { with: 'xnet://doc/*', can: 'read' },
        { with: '*', can: 'ping' }
      ],
      prf: [],
      sig: new Uint8Array()
    }

    it('should match exact capability', () => {
      expect(hasCapability(mockToken, 'xnet://doc/123', 'write')).toBe(true)
    })

    it('should not match missing capability', () => {
      expect(hasCapability(mockToken, 'xnet://doc/123', 'delete')).toBe(false)
    })

    it('should match wildcard resource', () => {
      expect(hasCapability(mockToken, 'xnet://other', 'ping')).toBe(true)
    })

    it('should match wildcard in resource path', () => {
      expect(hasCapability(mockToken, 'xnet://doc/abc', 'read')).toBe(true)
    })
  })

  describe('isExpired', () => {
    it('should detect expired token', () => {
      const token: UCANToken = {
        iss: 'did:key:test',
        aud: 'did:key:test2',
        exp: Math.floor(Date.now() / 1000) - 100,
        att: [],
        prf: [],
        sig: new Uint8Array()
      }
      expect(isExpired(token)).toBe(true)
    })

    it('should detect valid token', () => {
      const token: UCANToken = {
        iss: 'did:key:test',
        aud: 'did:key:test2',
        exp: Math.floor(Date.now() / 1000) + 3600,
        att: [],
        prf: [],
        sig: new Uint8Array()
      }
      expect(isExpired(token)).toBe(false)
    })
  })
})
