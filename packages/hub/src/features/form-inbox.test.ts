import type { PublicFormDefinition } from '../services/form-inbox-store'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { MemoryFormInboxStore } from '../services/form-inbox-store'
import { formInboxFeature, hashFormToken, type FormInboxOptions } from './form-inbox'

const DID = 'did:key:owner'
const OTHER_DID = 'did:key:other'

function mount(
  options: FormInboxOptions = {},
  did = DID
): { app: Hono; store: MemoryFormInboxStore } {
  const app = new Hono()
  const store = (options.store as MemoryFormInboxStore | undefined) ?? new MemoryFormInboxStore()
  const feature = formInboxFeature({ ...options, store })
  feature.mount?.({
    app,
    env: {},
    requireAuth: (async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>
    ) => {
      c.set('auth', { did })
      return next()
    }) as never,
    storage: 'memory',
    dataDir: '/tmp',
    appUrl: 'http://localhost'
  })
  return { app, store }
}

const definition: PublicFormDefinition = {
  title: 'RSVP',
  questions: [
    { fieldId: 'name', label: 'Your name', required: true, type: 'text' },
    { fieldId: 'attending', type: 'checkbox' }
  ],
  confirmation: { title: 'Thanks!' }
}

async function mintToken(app: Hono): Promise<{ token: string; tokenHash: string }> {
  const res = await app.request('/forms', {
    method: 'POST',
    body: JSON.stringify({
      viewId: 'view-1',
      databaseId: 'db-1',
      space: 'space-1',
      definition
    }),
    headers: { 'content-type': 'application/json' }
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { token: string; tokenHash: string }
  expect(body.token).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  expect(body.tokenHash).toBe(hashFormToken(body.token))
  return body
}

const submit = (app: Hono, token: string, body: Record<string, unknown>) =>
  app.request(`/f/${token}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  })

describe('formInboxFeature', () => {
  it('mints a token and serves the sanitized definition anonymously', async () => {
    const { app } = mount()
    const { token } = await mintToken(app)

    const res = await app.request(`/f/${token}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ definition, accepting: true })
    // Nothing beyond the published snapshot: no DIDs, ids, or space.
    expect(JSON.stringify(body)).not.toContain(DID)
    expect(JSON.stringify(body)).not.toContain('space-1')
    expect(JSON.stringify(body)).not.toContain('db-1')
  })

  it('stores an anonymous submission and lists it for the owner', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)

    const res = await submit(app, token, {
      nonce: 'nonce-12345',
      answers: { name: 'Ada', attending: true },
      website: ''
    })
    expect(res.status).toBe(202)
    expect(((await res.json()) as { confirmation: unknown }).confirmation).toEqual({
      title: 'Thanks!'
    })

    const list = await app.request(`/forms/${tokenHash}/submissions`)
    const { submissions } = (await list.json()) as { submissions: Array<Record<string, unknown>> }
    expect(submissions).toHaveLength(1)
    expect(submissions[0].nonce).toBe('nonce-12345')
    expect(submissions[0].answers).toEqual({ name: 'Ada', attending: true })
    expect(submissions[0].status).toBe('pending')
  })

  it('collapses duplicate nonces (idempotent retries)', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)

    const first = await submit(app, token, { nonce: 'same-nonce', answers: { name: 'Ada' } })
    const second = await submit(app, token, { nonce: 'same-nonce', answers: { name: 'Ada' } })
    expect(first.status).toBe(202)
    expect(second.status).toBe(202)

    const list = await app.request(`/forms/${tokenHash}/submissions`)
    const { submissions } = (await list.json()) as { submissions: unknown[] }
    expect(submissions).toHaveLength(1)
  })

  it('drops honeypot-filled submissions without storing (and lies politely)', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)

    const res = await submit(app, token, {
      nonce: 'bot-nonce-1',
      answers: { name: 'spam' },
      website: 'https://spam.example'
    })
    expect(res.status).toBe(202)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)

    const list = await app.request(`/forms/${tokenHash}/submissions`)
    expect(((await list.json()) as { submissions: unknown[] }).submissions).toHaveLength(0)
  })

  it('rejects oversized submissions', async () => {
    const { app } = mount()
    const { token } = await mintToken(app)
    const res = await submit(app, token, {
      nonce: 'big-nonce-1',
      answers: { blob: 'x'.repeat(70 * 1024) }
    })
    expect(res.status).toBe(413)
  })

  it('rate-limits anonymous submissions per IP', async () => {
    const { app } = mount({ submitRateLimit: { maxAttempts: 2, windowMs: 60_000 } })
    const { token } = await mintToken(app)
    expect((await submit(app, token, { nonce: 'nonce-aa-1', answers: {} })).status).toBe(202)
    expect((await submit(app, token, { nonce: 'nonce-aa-2', answers: {} })).status).toBe(202)
    expect((await submit(app, token, { nonce: 'nonce-aa-3', answers: {} })).status).toBe(429)
  })

  it('404s unknown, disabled, and expired tokens without an existence oracle', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)

    expect((await app.request('/f/definitely-not-a-token-1234')).status).toBe(404)

    await app.request(`/forms/${tokenHash}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: true }),
      headers: { 'content-type': 'application/json' }
    })
    expect((await app.request(`/f/${token}`)).status).toBe(404)
    expect((await submit(app, token, { nonce: 'nonce-x-99', answers: {} })).status).toBe(404)
  })

  it('refuses submissions when accepting is off (form closed, not gone)', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)

    await app.request(`/forms/${tokenHash}`, {
      method: 'PATCH',
      body: JSON.stringify({ accepting: false }),
      headers: { 'content-type': 'application/json' }
    })

    const def = await app.request(`/f/${token}`)
    expect(def.status).toBe(200)
    expect(((await def.json()) as { accepting: boolean }).accepting).toBe(false)

    expect((await submit(app, token, { nonce: 'nonce-y-99', answers: {} })).status).toBe(403)
  })

  it('acks (deletes) and rejects (keeps for review) submissions', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)
    await submit(app, token, { nonce: 'nonce-ok-01', answers: { name: 'Ada' } })
    await submit(app, token, { nonce: 'nonce-bad-1', answers: { gone: 'stale' } })

    const ack = await app.request(`/forms/${tokenHash}/submissions/ack`, {
      method: 'POST',
      body: JSON.stringify({ nonces: ['nonce-ok-01'] }),
      headers: { 'content-type': 'application/json' }
    })
    expect(ack.status).toBe(200)

    const reject = await app.request(`/forms/${tokenHash}/submissions/reject`, {
      method: 'POST',
      body: JSON.stringify({ nonce: 'nonce-bad-1', reasons: ['unknown-field:gone'] }),
      headers: { 'content-type': 'application/json' }
    })
    expect(reject.status).toBe(200)

    const list = await app.request(`/forms/${tokenHash}/submissions`)
    const { submissions } = (await list.json()) as { submissions: Array<Record<string, unknown>> }
    expect(submissions).toHaveLength(1)
    expect(submissions[0].status).toBe('rejected')
    expect(submissions[0].rejectionReasons).toEqual(['unknown-field:gone'])

    const pending = await app.request(`/forms/${tokenHash}/submissions?status=pending`)
    expect(((await pending.json()) as { submissions: unknown[] }).submissions).toHaveLength(0)
  })

  it("hides other creators' tokens from management routes", async () => {
    const store = new MemoryFormInboxStore()
    const { app } = mount({ store })
    const { tokenHash } = await mintToken(app)

    const { app: otherApp } = mount({ store }, OTHER_DID)
    expect((await otherApp.request(`/forms/${tokenHash}/submissions`)).status).toBe(404)
    expect(
      (
        await otherApp.request(`/forms/${tokenHash}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: true }),
          headers: { 'content-type': 'application/json' }
        })
      ).status
    ).toBe(404)

    const list = await otherApp.request('/forms')
    expect(((await list.json()) as { forms: unknown[] }).forms).toHaveLength(0)
  })

  it('lists pending/rejected counts per form for the owner', async () => {
    const { app } = mount()
    const { token, tokenHash } = await mintToken(app)
    await submit(app, token, { nonce: 'nonce-cc-01', answers: {} })
    await submit(app, token, { nonce: 'nonce-cc-02', answers: {} })
    await app.request(`/forms/${tokenHash}/submissions/reject`, {
      method: 'POST',
      body: JSON.stringify({ nonce: 'nonce-cc-02' }),
      headers: { 'content-type': 'application/json' }
    })

    const res = await app.request('/forms?viewId=view-1')
    const { forms } = (await res.json()) as {
      forms: Array<{ pending: number; rejected: number }>
    }
    expect(forms).toHaveLength(1)
    expect(forms[0].pending).toBe(1)
    expect(forms[0].rejected).toBe(1)
  })
})
