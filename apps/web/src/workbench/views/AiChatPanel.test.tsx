import type { ConnectorDetection } from '@xnetjs/plugins'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  detections: [
    {
      tier: 'cloud-key',
      label: 'Cloud API key',
      available: true,
      toolCalling: 'reliable',
      preference: 2
    },
    {
      tier: 'local-server',
      label: 'Local model',
      available: false,
      setupHint: 'Start Ollama or LM Studio.',
      toolCalling: 'reliable',
      preference: 3
    }
  ] as ConnectorDetection[]
}))

vi.mock('@xnetjs/plugins', () => ({
  detectConnectors: async () => fixture.detections,
  createAIProvider: () => ({ name: 'mock', generate: async () => '' }),
  createAiAgentRuntime: () => ({
    load: async () => undefined,
    subscribe: () => () => undefined,
    createThread: async () => ({ id: 't1' }),
    runTurn: async () => ({})
  }),
  createAiSurfaceService: () => ({ createContextPack: async () => ({ resources: [] }) }),
  createPromptApiProvider: async () => null
}))

// The panel reads the workspace store + schema registry to ground replies.
vi.mock('@xnetjs/react/internal', () => ({
  useNodeStore: () => ({ store: { name: 'fake-store' }, isReady: true, error: null })
}))
vi.mock('@xnetjs/data', () => ({ schemaRegistry: {} }))

// Imported after the mock so the panel binds to the mocked module.
const { AiChatPanel } = await import('./AiChatPanel')

const DEFAULT_DETECTIONS = fixture.detections

afterEach(() => {
  fixture.detections = DEFAULT_DETECTIONS
  if (typeof window !== 'undefined') window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('AiChatPanel', () => {
  it('renders the empty state and the connector picker', async () => {
    render(<AiChatPanel />)
    expect(screen.getByText(/Ask about your workspace/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Cloud API key')).toBeTruthy())
    expect(screen.getByText(/Local model — unavailable/)).toBeTruthy()
  })

  it('shows the cloud-key fields and the capability badge for the active tier', async () => {
    render(<AiChatPanel />)
    await waitFor(() => expect(screen.getByPlaceholderText(/API key/)).toBeTruthy())
    // Phase 1: the assistant reads the workspace but can't write yet.
    expect(screen.getByText('reads workspace')).toBeTruthy()
  })

  it('disables the composer until a model is configured', async () => {
    render(<AiChatPanel />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Select and configure a model/)).toBeTruthy()
    )
  })

  it('shows the local bridge agent + running status from /health', async () => {
    fixture.detections = [
      {
        tier: 'bridge',
        label: 'Local bridge',
        available: true,
        detail: 'http://127.0.0.1:31416',
        toolCalling: 'reliable',
        preference: 1
      }
    ]
    window.localStorage.setItem('xnet:ai-tier', 'bridge')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ ok: true, agent: 'claude', version: '1.0.0' }) }))
    )
    render(<AiChatPanel />)
    await waitFor(() => expect(screen.getByText(/Running claude/)).toBeTruthy())
  })
})
