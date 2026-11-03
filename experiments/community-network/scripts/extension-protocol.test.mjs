import assert from 'node:assert/strict'
import { test } from 'node:test'
import { playbackRequest, playbackResponse } from '../extension/protocol.js'

const id = 'a'.repeat(64)
const otherId = 'b'.repeat(64)
const extension = 'a'.repeat(32)
const player = `chrome-extension://${extension}/player.html`
const sender = {
  id: extension,
  frameId: 1,
  url: `${player}#${id}`,
  tab: { url: `http://127.0.0.1:4380/watch/${id}` }
}
const request = { op: 'play', id }
const validate = (message = request, origin = sender) =>
  playbackRequest(message, origin, extension, player)
const response = (
  url = `http://127.0.0.1:43210/media/${id}?ticket=${otherId}`,
  kind = 'video'
) => ({
  ok: true,
  result: { url, item: { record: { payload: { kind, title: 'A community film' } } } }
})

test('the paired player can request only its current public item', () => {
  assert.deepEqual(validate({ ...request, opIgnored: 'publish', path: '/private' }), request)
  assert.deepEqual(
    validate(request, { ...sender, tab: { url: `${sender.tab.url}?from=friend` } }),
    request
  )
})

test('rejects malformed messages and unsupported native operations', () => {
  for (const message of [
    null,
    {},
    'play',
    { op: 'status' },
    { op: 'publish', id },
    { op: 'play', id: '../secret' }
  ]) {
    assert.throws(() => validate(message))
  }
})

test('rejects forged identities, top-level pages and mismatched player frames', () => {
  for (const origin of [
    null,
    { ...sender, id: 'b'.repeat(32) },
    { ...sender, frameId: 0 },
    { ...sender, frameId: undefined },
    { ...sender, url: `${player}#${otherId}` },
    { ...sender, url: `${player}#${id}/extra` },
    { ...sender, url: sender.tab.url }
  ])
    assert.throws(() => validate(request, origin))
})

test('rejects another registry, content ID, malformed URL or absent tab', () => {
  for (const url of [
    'not a URL',
    `https://example.com/watch/${id}`,
    `http://127.0.0.1:4381/watch/${id}`,
    `http://localhost:4380/watch/${id}`,
    `http://127.0.0.1:4380/watch/${otherId}`,
    `http://name:secret@127.0.0.1:4380/watch/${id}`,
    undefined
  ])
    assert.throws(() => validate(request, { ...sender, tab: { url } }))
  assert.throws(() => validate(request, { ...sender, tab: undefined }))
})

test('accepts scoped loopback playback for images and videos', () => {
  for (const kind of ['video', 'image']) {
    const value = response(undefined, kind)
    assert.deepEqual(playbackResponse(value, id), {
      url: value.result.url,
      title: 'A community film',
      kind
    })
  }
})

test('rejects unscoped, remote, credential-bearing and mismatched playback URLs', () => {
  for (const url of [
    'not a URL',
    `https://example.com/media/${id}?ticket=${otherId}`,
    `http://localhost:43210/media/${id}?ticket=${otherId}`,
    `http://127.0.0.1/media/${id}?ticket=${otherId}`,
    `http://name:secret@127.0.0.1:43210/media/${id}?ticket=${otherId}`,
    `http://127.0.0.1:43210/media/${otherId}?ticket=${otherId}`,
    `http://127.0.0.1:43210/media/${id}`,
    `http://127.0.0.1:43210/media/${id}?ticket=bad`,
    `http://127.0.0.1:43210/media/${id}?ticket=${otherId}&ticket=${id}`,
    `http://127.0.0.1:43210/media/${id}?ticket=${otherId}#extra`
  ])
    assert.throws(() => playbackResponse(response(url), id))
})

test('preserves desktop denials and rejects incomplete or unexpected metadata', () => {
  assert.throws(
    () => playbackResponse({ ok: false, error: 'Hosting is paused.' }, id),
    /Hosting is paused/
  )
  for (const value of [
    null,
    {},
    { ok: true },
    response(undefined, 'html'),
    { ...response(), result: { url: response().result.url } }
  ]) {
    assert.throws(() => playbackResponse(value, id))
  }
})
