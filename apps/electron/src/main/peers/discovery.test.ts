import { randomBytes, randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
const request = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ net: { fetch: request } }))
import { discoverBluesky } from './discovery'
import { createBinding, encodeWebInvite, signInvite } from './protocol'
beforeEach(() => request.mockReset())
it('reads public profiles without turning a social handle into access', async () => {
  request.mockResolvedValue(
    new Response(
      JSON.stringify({
        did: 'did:plc:alice',
        handle: 'alice.test',
        displayName: 'Alice',
        description: 'Hello'
      })
    )
  )
  expect(await discoverBluesky('@Alice.test')).toEqual({
    name: 'Alice',
    handle: 'alice.test',
    url: 'https://bsky.app/profile/alice.test',
    link: undefined
  })
  expect(request.mock.calls[0][0]).toBe(
    'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=alice.test'
  )
  await expect(discoverBluesky('https://evil.test/private')).rejects.toThrow('handle')
  expect(request).toHaveBeenCalledTimes(1)
})
it('accepts a signed xNet link published by the profile and rejects a substituted pinned author', async () => {
  const seed = randomBytes(32)
  const link = encodeWebInvite(
    signInvite(
      {
        version: 3,
        access: 'contact',
        channel: `iroh-${randomUUID()}`,
        name: 'Alice',
        binding: createBinding(seed, 'a'.repeat(64)),
        secret: 'a'.repeat(64),
        ticket: 'ticket',
        expires: Date.now() + 60000
      },
      seed
    )
  )
  const profile = {
    did: 'did:plc:alice',
    handle: 'alice.test',
    pinnedPost: { uri: 'at://did:plc:alice/app.bsky.feed.post/one' }
  }
  request
    .mockResolvedValueOnce(new Response(JSON.stringify(profile)))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          posts: [{ author: { did: profile.did }, record: { embed: { external: { uri: link } } } }]
        })
      )
    )
  expect((await discoverBluesky('alice.test')).link).toBe(link)
  request
    .mockResolvedValueOnce(new Response(JSON.stringify(profile)))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          posts: [
            { author: { did: 'did:plc:mallory' }, record: { embed: { external: { uri: link } } } }
          ]
        })
      )
    )
  expect((await discoverBluesky('alice.test')).link).toBeUndefined()
})
it('surfaces provider errors instead of presenting an empty search as success', async () => {
  request.mockResolvedValue(new Response('rate limited', { status: 429 }))
  await expect(discoverBluesky('alice.test')).rejects.toThrow('unavailable')
})
