/**
 * Time Machine panel (exploration 0329): the pure helpers behave (density
 * bucketing, word/sentence diff formatting) and the panel smoke-renders over
 * a real memory store — change count, density strip, scrubber, disabled
 * restore at latest, and keyboard scrubbing that enables it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, NodeStore, PageSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import React, { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { bucketDensity, bucketIndexFor } from './density'
import { formatValue, longTextDelta, sentenceCount, wordCount } from './diff-format'
import { TimeMachinePanel } from './TimeMachinePanel'

describe('density buckets', () => {
  it('spreads changes across the wall-time span and records first indexes', () => {
    const buckets = bucketDensity([0, 10, 20, 100], 4)
    expect(buckets).toHaveLength(4)
    expect(buckets.map((b) => b.count)).toEqual([3, 0, 0, 1])
    expect(buckets[0].firstIndex).toBe(0)
    expect(buckets[3].firstIndex).toBe(3)
    expect(bucketIndexFor(buckets, 100)).toBe(3)
  })

  it('collapses a single instant into one bucket', () => {
    expect(bucketDensity([5, 5, 5], 8)).toEqual([
      { count: 3, start: 5, end: 5, firstIndex: 0 }
    ])
    expect(bucketDensity([], 8)).toEqual([])
  })
})

describe('diff formatting', () => {
  it('counts words and sentences for long prose instead of characters', () => {
    const prose = 'One two three. Four five! Six seven? '.repeat(6)
    expect(formatValue(prose)).toBe(`${wordCount(prose)} words · ${sentenceCount(prose)} sentences`)
    expect(wordCount('one  two\nthree')).toBe(3)
    expect(sentenceCount('No terminal punctuation')).toBe(1)
  })

  it('renders scalars verbatim and reports word deltas for long text', () => {
    expect(formatValue('short title')).toBe('short title')
    expect(formatValue(undefined)).toBe('—')
    expect(formatValue([1, 2, 3])).toBe('3 items')
    const before = 'word '.repeat(40)
    const after = 'word '.repeat(43)
    expect(longTextDelta(before, after)).toBe('+3 words')
    expect(longTextDelta('a', 'b')).toBeNull()
  })
})

describe('TimeMachinePanel', () => {
  async function seed() {
    const { identity, privateKey } = generateIdentity()
    const storage = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage,
      authorDID: identity.did as never,
      signingKey: privateKey
    })
    await store.initialize()
    const node = await store.create({
      schemaId: PageSchema.schema['@id'],
      properties: { title: 'v1' }
    })
    await store.update(node.id, { properties: { title: 'v2' } })

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <XNetProvider
          config={{
            nodeStorage: storage,
            authorDID: identity.did as never,
            signingKey: privateKey,
            disableSyncManager: true
          }}
        >
          {children}
        </XNetProvider>
      )
    }
    return { node, Wrapper }
  }

  it('renders the timeline and enables restore only off-latest', async () => {
    const { node, Wrapper } = await seed()
    render(
      <Wrapper>
        <TimeMachinePanel nodeId={node.id} />
      </Wrapper>
    )

    await waitFor(() => expect(screen.getByText('2 changes')).toBeTruthy())
    expect(screen.getByTestId('tm-density')).toBeTruthy()
    expect(screen.getByLabelText('Scrub history')).toBeTruthy()

    const restore = screen.getByRole('button', { name: /Restore this version/ })
    expect((restore as HTMLButtonElement).disabled).toBe(true)

    // ← steps back one change while the panel is focused; restore arms.
    fireEvent.keyDown(screen.getByTestId('time-machine'), { key: 'ArrowLeft' })
    await waitFor(() => expect((restore as HTMLButtonElement).disabled).toBe(false))
    // The scrubbed-vs-current diff lists the title property rolling back.
    await waitFor(() =>
      expect(screen.getByTitle('title: v1 (this version) → v2 (current)')).toBeTruthy()
    )
  })

  it('offers "Name this version" and lists the checkpoint', async () => {
    const { node, Wrapper } = await seed()
    render(
      <Wrapper>
        <TimeMachinePanel nodeId={node.id} />
      </Wrapper>
    )
    await waitFor(() => expect(screen.getByText('2 changes')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Name this version/ }))
    fireEvent.change(screen.getByLabelText('Version name'), {
      target: { value: 'Before rewrite' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    fireEvent.click(screen.getByLabelText(/Named versions only/))
    await waitFor(() => expect(screen.getByText('Before rewrite')).toBeTruthy())
  })
})
