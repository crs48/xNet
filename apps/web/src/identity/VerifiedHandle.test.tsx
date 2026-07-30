/**
 * VerifiedHandle is a represent-only display surface (F2, 0389): it shows and
 * resolves a foreign ATProto DID but never signs with it. These tests pin the
 * guard that a malformed stored DID is never sent to the hub as a binding
 * lookup — it degrades to "linked, unverified" instead.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VerifiedHandle } from './VerifiedHandle'

const XNET_DID = 'did:key:z6MkExampleExampleExampleExampleExampleExampleExam' as const
const HUB = 'https://hub.example'

afterEach(() => vi.restoreAllMocks())

describe('VerifiedHandle', () => {
  it('queries the hub for a well-formed foreign DID', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ verified: true }), { status: 200 }))

    render(
      <VerifiedHandle
        atprotoDid="did:web:alice.example"
        atprotoHandle="alice.example"
        xnetDid={XNET_DID}
        hubHttpUrl={HUB}
      />
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/atproto/binding/')
  })

  it('never calls the hub for a malformed stored DID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    render(
      <VerifiedHandle
        // A garbage value that survived in a text() field — must not be sent.
        atprotoDid={'not-a-did' as `did:web:${string}`}
        atprotoHandle="alice.example"
        xnetDid={XNET_DID}
        hubHttpUrl={HUB}
      />
    )

    // Degrades to unverified without a request.
    await waitFor(() => expect(screen.getByText(/unverified/)).toBeTruthy())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
