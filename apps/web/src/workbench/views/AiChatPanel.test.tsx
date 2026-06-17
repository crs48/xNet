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
  createPromptApiProvider: async () => null
}))

// Imported after the mock so the panel binds to the mocked module.
const { AiChatPanel } = await import('./AiChatPanel')

describe('AiChatPanel', () => {
  it('renders the empty state and the connector picker', async () => {
    render(<AiChatPanel />)
    expect(screen.getByText(/Chat with an AI/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Cloud API key')).toBeTruthy())
    expect(screen.getByText(/Local model — unavailable/)).toBeTruthy()
  })

  it('shows the cloud-key fields and the capability badge for the active tier', async () => {
    render(<AiChatPanel />)
    await waitFor(() => expect(screen.getByPlaceholderText(/API key/)).toBeTruthy())
    // Phase 0: chat-only on every tier until the tool surface is wired in.
    expect(screen.getByText('chat')).toBeTruthy()
  })

  it('disables the composer until a model is configured', async () => {
    render(<AiChatPanel />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Select and configure a model/)).toBeTruthy()
    )
  })
})
