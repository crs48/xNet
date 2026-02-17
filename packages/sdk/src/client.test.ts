/**
 * Tests for createClient - SDK client initialization with telemetry
 */
import { describe, it, expect, vi } from 'vitest'
import { createClient } from './client'

describe('createClient', () => {
  describe('identity creation', () => {
    it('should generate a new identity when no privateKey is provided', async () => {
      const client = await createClient()
      expect(client.did).toMatch(/^did:key:/)
      expect(client.identity).toBeDefined()
      expect(client.privateKey).toBeInstanceOf(Uint8Array)
      expect(client.privateKey.length).toBeGreaterThan(0)
    })

    it('should restore identity from existing privateKey', async () => {
      // First, create a client to get a key
      const original = await createClient()
      const { privateKey } = original

      // Restore from the key
      const restored = await createClient({ privateKey })
      expect(restored.did).toBe(original.did)
      expect(restored.identity.did).toBe(original.identity.did)
    })

    it('should return consistent DID for same private key', async () => {
      const first = await createClient()
      const second = await createClient({ privateKey: first.privateKey })
      expect(second.did).toBe(first.did)
    })
  })

  describe('telemetry', () => {
    it('should report sdk.client_create and sdk.client_init_success for new identity', async () => {
      const telemetry = {
        reportUsage: vi.fn(),
        reportCrash: vi.fn()
      }

      await createClient({ telemetry })

      expect(telemetry.reportUsage).toHaveBeenCalledWith('sdk.client_create', 1)
      expect(telemetry.reportUsage).toHaveBeenCalledWith('sdk.client_init_success', 1)
      expect(telemetry.reportCrash).not.toHaveBeenCalled()
    })

    it('should report sdk.client_restore and sdk.client_init_success for restored identity', async () => {
      const telemetry = {
        reportUsage: vi.fn(),
        reportCrash: vi.fn()
      }

      const { privateKey } = await createClient()
      telemetry.reportUsage.mockClear()

      await createClient({ privateKey, telemetry })

      expect(telemetry.reportUsage).toHaveBeenCalledWith('sdk.client_restore', 1)
      expect(telemetry.reportUsage).toHaveBeenCalledWith('sdk.client_init_success', 1)
      expect(telemetry.reportCrash).not.toHaveBeenCalled()
    })

    it('should report sdk.client_init_failure and crash on error', async () => {
      const telemetry = {
        reportUsage: vi.fn(),
        reportCrash: vi.fn()
      }

      // Pass an invalid private key (wrong length/format)
      const invalidKey = new Uint8Array(1) // too short
      await expect(createClient({ privateKey: invalidKey, telemetry })).rejects.toThrow()

      expect(telemetry.reportUsage).toHaveBeenCalledWith('sdk.client_init_failure', 1)
      expect(telemetry.reportCrash).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ codeNamespace: 'sdk.createClient', operation: 'restore' })
      )
    })

    it('should work without telemetry (no-op)', async () => {
      // Should not throw even without telemetry
      const client = await createClient()
      expect(client.did).toBeDefined()
    })
  })
})
