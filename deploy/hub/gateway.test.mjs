import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { authorizeRegistration, createBudget, createPersistence, startGateway } from './gateway.mjs'
const key = () => {
  const k = generateKeyPairSync('ed25519')
  return {
    ...k,
    endpoint: k.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
  }
}
const proof = (k, timestamp = Date.now()) => ({
  endpoint: k.endpoint,
  timestamp,
  signature: sign(
    null,
    Buffer.from(`xnet/relay-register/1\n${k.endpoint}\n${timestamp}`),
    k.privateKey
  ).toString('hex')
})
test('admission requires proof and a single-use delegation from an admitted device', () => {
  const a = key(),
    b = key(),
    c = key()
  const empty = { endpoints: [], admissions: [] }
  const state = authorizeRegistration(proof(a), empty, [a.endpoint])
  assert.throws(() => authorizeRegistration(proof(b), state, [a.endpoint]))
  const nonce = randomBytes(32).toString('hex'),
    expires = Date.now() + 10000
  const admission = {
    parent: a.endpoint,
    nonce,
    expires,
    signature: sign(
      null,
      Buffer.from(`xnet/relay-invite/1\n${a.endpoint}\n${nonce}\n${expires}`),
      a.privateKey
    ).toString('hex')
  }
  const next = authorizeRegistration({ ...proof(b), admission }, state, [a.endpoint])
  assert(next.endpoints.includes(b.endpoint))
  assert.throws(() => authorizeRegistration({ ...proof(c), admission }, next, [a.endpoint]))
  assert.throws(() =>
    authorizeRegistration({ ...proof(c), signature: '00'.repeat(64) }, next, [a.endpoint])
  )
  assert.throws(() => authorizeRegistration(proof(c, Date.now() - 3600000), next, [a.endpoint]))
})
test('quota survives restart, fails closed on corruption, and renews next UTC day', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xnet-relay-'))
  try {
    let now = Date.UTC(2026, 9, 22)
    const store = createPersistence(dir),
      use = createBudget(store, 1024, () => now)
    for (const invalid of [NaN, Infinity, -1, 0, 0.5, 2 ** 40])
      assert.throws(() => createBudget(store, invalid))
    assert(use(100))
    assert(use(924))
    assert.equal(use(1), false)
    assert.equal(createBudget(createPersistence(dir), 1024, () => now)(1), false)
    now += 86400000
    assert(use(1024))
    assert.equal(use(1), false)
    writeFileSync(join(dir, 'relay.json'), '{')
    assert.throws(() => createPersistence(dir))
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('health probes the relay and operator revocation survives restart without resetting quota', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xnet-relay-health-'))
  const a = key(),
    revoked = key()
  const store = createPersistence(directory)
  store.save({ ...store.get(), endpoints: [revoked.endpoint], reserved: 512 })
  let healthy = false
  const upstream = createServer((_req, res) => {
    res.writeHead(healthy ? 200 : 503)
    res.end()
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const gateway = await startGateway({
    directory,
    bootstrap: [a.endpoint],
    revoked: [revoked.endpoint],
    port: 0,
    accessPort: 0,
    relayPort: upstream.address().port,
    host: '127.0.0.1'
  })
  const url = `http://127.0.0.1:${gateway.server.address().port}`
  try {
    assert.equal((await fetch(url + '/healthz')).status, 503)
    healthy = true
    assert.equal((await fetch(url + '/healthz')).status, 200)
    assert.equal(
      (await fetch(url + '/register', { method: 'POST', body: JSON.stringify(proof(revoked)) }))
        .status,
      403
    )
    const saved = createPersistence(directory).get()
    assert.deepEqual(saved.endpoints, [])
    assert.equal(saved.reserved, 512)
  } finally {
    await gateway.close()
    upstream.closeAllConnections()
    await new Promise((resolve) => upstream.close(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('reusable admission is signed, bounded, and cannot raise its use allowance', () => {
  const host = key(),
    people = [key(), key(), key()]
  const nonce = randomBytes(32).toString('hex'),
    expires = Date.now() + 60000
  const admission = {
    parent: host.endpoint,
    nonce,
    expires,
    maxUses: 2,
    signature: sign(
      null,
      Buffer.from(`xnet/relay-invite/2\n${host.endpoint}\n${nonce}\n${expires}\n2`),
      host.privateKey
    ).toString('hex')
  }
  let state = authorizeRegistration(proof(host), { endpoints: [], admissions: [] }, [host.endpoint])
  for (const person of people.slice(0, 2))
    state = authorizeRegistration({ ...proof(person), admission }, state, [host.endpoint])
  assert.throws(
    () => authorizeRegistration({ ...proof(people[2]), admission }, state, [host.endpoint]),
    /already used/
  )
  assert.throws(() =>
    authorizeRegistration({ ...proof(people[2]), admission: { ...admission, maxUses: 8 } }, state, [
      host.endpoint
    ])
  )
})
