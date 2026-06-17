import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  ]
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
})
