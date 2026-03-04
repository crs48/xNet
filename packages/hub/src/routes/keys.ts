/**
 * @xnetjs/hub - X25519 key registry routes.
 */

import type { KeyRegistryService } from '../services/key-registry'
import type { DID } from '@xnetjs/core'
import { base64ToBytes, bytesToHex } from '@xnetjs/crypto'
import { Hono } from 'hono'
import { KeyRegistryError } from '../services/key-registry'
import { isRecord } from '../utils/validation'

type RegisterPayload = {
  did: DID
  x25519PublicKey: string
  proof: string
}

const isRegisterPayload = (value: unknown): value is RegisterPayload => {
  if (!isRecord(value)) return false
  return (
    typeof value.did === 'string' &&
    typeof value.x25519PublicKey === 'string' &&
    typeof value.proof === 'string'
  )
}

export const createKeyRegistryRoutes = (registry: KeyRegistryService): Hono => {
  const app = new Hono()

  app.post('/register', async (c) => {
    const body = await c.req.json()
    if (!isRegisterPayload(body)) {
      return c.json({ error: 'Invalid key registration payload', code: 'INVALID_INPUT' }, 400)
    }

    try {
      const x25519PublicKey = base64ToBytes(body.x25519PublicKey)
      const proof = base64ToBytes(body.proof)
      const record = await registry.register({ did: body.did, x25519PublicKey, proof })
      return c.json({
        did: record.did,
        registeredAt: record.registeredAt,
        updatedAt: record.updatedAt
      })
    } catch (err) {
      if (err instanceof KeyRegistryError) {
        return c.json({ error: err.message, code: err.code }, 400)
      }
      return c.json({ error: 'Invalid key registration payload', code: 'INVALID_INPUT' }, 400)
    }
  })

  app.get('/:did{did:key:.+}/x25519', async (c) => {
    const did = c.req.param('did') as DID
    const record = await registry.get(did)
    if (!record) {
      return c.json({ error: 'Key not found', code: 'NOT_FOUND' }, 404)
    }

    const keyBytes = Uint8Array.from(record.x25519PublicKey)

    return c.body(keyBytes, 200, {
      'Content-Type': 'application/octet-stream'
    })
  })

  app.post('/batch', async (c) => {
    const body = await c.req.json()
    if (!isRecord(body) || !Array.isArray(body.dids)) {
      return c.json({ error: 'Invalid batch lookup payload', code: 'INVALID_INPUT' }, 400)
    }

    const dids = body.dids.filter((did): did is DID => typeof did === 'string')
    const keys = await registry.getBatch(dids)
    const keyMap: Record<string, string> = {}
    for (const [did, key] of keys) {
      keyMap[did] = bytesToHex(key)
    }

    return c.json({ keys: keyMap })
  })

  return app
}
