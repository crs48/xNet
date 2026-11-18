import assert from 'node:assert/strict'
import { initialState, hosting, access, search, advanceUpload } from './model.mjs'

let cases = 0
for (const device of ['web', 'desktop', 'phone']) {
  for (const policy of ['open', 'required']) {
    for (const charging of [false, true]) {
      for (const unmetered of [false, true]) {
        for (const consent of [false, true]) {
          const state = {
            ...initialState(),
            account: true,
            device,
            policy,
            charging,
            unmetered,
            consent
          }
          cases++
          assert.equal(access(state).allowed, policy === 'open' || hosting(state).active)
          if (!charging || !unmetered || !consent || device === 'web')
            assert.equal(hosting(state).active, false)
        }
      }
    }
  }
}
const member = { ...initialState(), account: true, consent: true, device: 'desktop' }
assert.equal(
  search({ ...initialState(), policy: 'required', scope: 'wider' }).status,
  'participation'
)
assert.equal(search({ ...initialState(), policy: 'required', scope: 'local' }).status, 'ready')
assert(hosting(member).active)
for (const change of [
  { paused: true },
  { capacity: 0 },
  { traffic: 0 },
  { device: 'phone', foreground: false }
]) {
  assert.equal(hosting({ ...member, ...change }).active, false)
  assert(access({ ...member, ...change }).allowed, 'Optional hosting interrupted ordinary reading')
}
assert.equal(
  access({ ...member, entry: 'private' }).allowed,
  false,
  'Login alone unlocked encrypted content'
)
assert(access({ ...member, entry: 'private', verified: true }).allowed)
const locked = { ...member, scope: 'wider', funding: 'paid', plan: false }
assert.equal(search(locked).status, 'subscription')
assert.equal(search({ ...locked, scope: 'local' }).status, 'ready')
assert(access(locked).allowed)
assert.equal(search({ ...member, scope: 'community', indexOnline: false }).status, 'offline')
assert.equal(search({ ...member, indexOnline: false }).status, 'ready')
assert.equal(
  search(member).results.some((r) => r.visibility === 'private'),
  false
)
assert(search({ ...member, verified: true }).results.some((r) => r.visibility === 'private'))
assert.equal(
  search({ ...member, verified: true, scope: 'wider' }).results.some(
    (r) => r.visibility === 'private'
  ),
  false
)
assert.equal(search({ ...member, query: 'nothing matches this' }).results.length, 0)
for (const change of [
  { account: false },
  { origin: false, upload: 'prepared' },
  { backup: false, upload: 'stored' },
  { audience: 'private', verified: false }
]) {
  const before = { ...member, ...change }
  assert(advanceUpload(before).blocked)
  assert.equal(advanceUpload(before).state.upload, before.upload)
}
assert.equal(
  advanceUpload({ ...member, origin: false, backup: false }).state.upload,
  'prepared',
  'Offline drafting should remain possible'
)
let publishing = member
for (const expected of ['prepared', 'stored', 'published', 'indexed']) {
  publishing = advanceUpload(publishing).state
  assert.equal(publishing.upload, expected)
}
let privateUpload = { ...member, audience: 'private', verified: true }
for (let i = 0; i < 4; i++) privateUpload = advanceUpload(privateUpload).state
assert.equal(privateUpload.upload, 'delivered')
console.log(
  `PASS: ${cases} device/policy combinations plus permission, budget, search-boundary, outage, subscription, and publication edge checks.`
)
