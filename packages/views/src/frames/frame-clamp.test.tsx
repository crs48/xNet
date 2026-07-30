/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@xnetjs/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xnetjs/react')>()
  return {
    ...original,
    useNodeStore: () => ({
      store: {
        get: async (id: string) => ({
          id,
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: `Node ${id}` },
          timestamps: {}
        }),
        subscribeToNode: () => () => {}
      },
      isReady: true,
      error: null
    })
  }
})

import { FrameRenderer } from './FrameRenderer.js'
import { frameSourceRegistry } from './registry.js'
import type { FrameDef } from './types.js'

const frameFor = (nodeId: string): FrameDef => ({
  id: `test:${nodeId}`,
  source: { kind: 'node', nodeId },
  viewType: 'table',
  tier: 'live',
  sortKey: ''
})

const disposables: Array<{ dispose(): void }> = []

afterEach(() => {
  for (const d of disposables.splice(0)) d.dispose()
})

describe('FrameRenderer nesting clamp (0346)', () => {
  it('clamps a self-embed cycle (A inside A) to the summary card', async () => {
    // A renderer that recursively embeds the SAME node — the pathological
    // A→A cycle. Ancestry tracking must degrade the inner render.
    disposables.push(
      frameSourceRegistry.register({
        id: 'test-recursive',
        supportedSchemas: '*',
        component: ({ frame }) => (
          <div data-testid="frame-body">
            <FrameRenderer frame={frame} />
          </div>
        )
      })
    )
    const { container } = render(<FrameRenderer frame={frameFor('node-a')} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('frame-body').length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(container.querySelector('[data-frame-depth-clamped="true"]')).toBeTruthy()
    })
    // The cycle stopped at ONE nested body, not an infinite chain.
    expect(screen.getAllByTestId('frame-body')).toHaveLength(1)
  })

  it('clamps non-cyclic chains at depth 2 (A → B → C degrades C)', async () => {
    const chain: Record<string, string | null> = { 'node-a': 'node-b', 'node-b': 'node-c' }
    disposables.push(
      frameSourceRegistry.register({
        id: 'test-chain',
        supportedSchemas: '*',
        component: ({ nodeId }) => {
          const next = chain[nodeId]
          return (
            <div data-testid={`body-${nodeId}`}>
              {next ? <FrameRenderer frame={frameFor(next)} /> : 'leaf'}
            </div>
          )
        }
      })
    )
    const { container } = render(<FrameRenderer frame={frameFor('node-a')} />)
    await waitFor(() => {
      expect(screen.getByTestId('body-node-b')).toBeTruthy()
    })
    // node-c sits at depth 2 → clamped; its body never mounts.
    expect(container.querySelector('[data-frame-depth-clamped="true"]')).toBeTruthy()
    expect(screen.queryByTestId('body-node-c')).toBeNull()
  })

  it('renders a top-level frame unclamped', async () => {
    disposables.push(
      frameSourceRegistry.register({
        id: 'test-leaf',
        supportedSchemas: '*',
        component: ({ nodeId }) => <div data-testid="leaf">{nodeId}</div>
      })
    )
    const { container } = render(<FrameRenderer frame={frameFor('solo')} />)
    await waitFor(() => {
      expect(screen.getByTestId('leaf')).toBeTruthy()
    })
    expect(container.querySelector('[data-frame-depth-clamped="true"]')).toBeNull()
  })
})
