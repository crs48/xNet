import { createUCAN, generateKeyBundle } from '@xnetjs/identity'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHub, type HubInstance } from '../src'

const createAuthToken = (did: string, signingKey: Uint8Array): string =>
  createUCAN({
    issuer: did,
    issuerKey: signingKey,
    audience: 'did:key:hub',
    capabilities: [{ with: '*', can: 'hub/relay' }]
  })

describe('Schema Registry API', () => {
  let hub: HubInstance
  const PORT = 14453
  const BASE = `http://localhost:${PORT}`

  const keys = generateKeyBundle()
  const authorDid = keys.identity.did
  const token = createAuthToken(authorDid, keys.signingKey)

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: true, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  const recipeSchema = {
    iri: `xnet://${authorDid}/Recipe`,
    version: 1,
    name: 'Recipe',
    description: 'A cooking recipe with ingredients and steps',
    definition: {
      '@id': `xnet://${authorDid}/Recipe`,
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Recipe',
      namespace: `xnet://${authorDid}/`,
      properties: {
        title: { type: 'text', label: 'Title', required: true },
        servings: { type: 'number', label: 'Servings', default: 4 },
        ingredients: { type: 'text', label: 'Ingredients' },
        steps: { type: 'text', label: 'Steps' },
        prepTime: { type: 'number', label: 'Prep Time (min)' }
      }
    }
  }

  it('publishes and resolves a schema', async () => {
    const postRes = await fetch(`${BASE}/schemas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(recipeSchema)
    })
    expect(postRes.status).toBe(201)
    const record = await postRes.json()
    expect(record.iri).toBe(recipeSchema.iri)
    expect(record.propertiesCount).toBe(5)

    const getRes = await fetch(`${BASE}/schemas/resolve/${encodeURIComponent(recipeSchema.iri)}`)
    expect(getRes.status).toBe(200)
    const resolved = await getRes.json()
    expect(resolved.name).toBe('Recipe')
  })

  it('rejects version conflict', async () => {
    const res = await fetch(`${BASE}/schemas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(recipeSchema)
    })
    expect(res.status).toBe(409)
  })

  it('allows higher version and resolves latest', async () => {
    const v2 = { ...recipeSchema, version: 2, description: 'Updated recipe schema' }
    const res = await fetch(`${BASE}/schemas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(v2)
    })
    expect(res.status).toBe(201)

    const getRes = await fetch(`${BASE}/schemas/resolve/${encodeURIComponent(recipeSchema.iri)}`)
    const resolved = await getRes.json()
    expect(resolved.version).toBe(2)
  })

  it('returns 404 for unknown schema', async () => {
    const res = await fetch(`${BASE}/schemas/resolve/${encodeURIComponent('xnet://unknown/Foo')}`)
    expect(res.status).toBe(404)
  })

  it('searches schemas by keyword', async () => {
    const res = await fetch(`${BASE}/schemas?search=recipe`)
    expect(res.status).toBe(200)
    const { schemas } = await res.json()
    expect(schemas.some((schema: { name?: string }) => schema.name === 'Recipe')).toBe(true)
  })

  it('lists schemas by author', async () => {
    const res = await fetch(`${BASE}/schemas?author=${encodeURIComponent(authorDid)}`)
    expect(res.status).toBe(200)
    const { schemas } = await res.json()
    expect(schemas.length).toBeGreaterThanOrEqual(1)
    expect(schemas.every((schema: { authorDid?: string }) => schema.authorDid === authorDid)).toBe(
      true
    )
  })

  it('rejects invalid IRI format', async () => {
    const res = await fetch(`${BASE}/schemas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...recipeSchema, iri: 'http://invalid/path' })
    })
    expect(res.status).toBe(400)
  })

  it('enforces namespace ownership', async () => {
    const otherKeys = generateKeyBundle()
    const res = await fetch(`${BASE}/schemas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...recipeSchema,
        iri: `xnet://${otherKeys.identity.did}/Recipe`,
        definition: {
          ...recipeSchema.definition,
          '@id': `xnet://${otherKeys.identity.did}/Recipe`,
          namespace: `xnet://${otherKeys.identity.did}/`
        }
      })
    })
    expect(res.status).toBe(403)
  })
})
