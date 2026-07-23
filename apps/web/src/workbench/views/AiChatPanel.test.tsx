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
  ] as ConnectorDetection[],
  nanoState: 'available' as 'unavailable' | 'downloadable' | 'downloading' | 'available'
}))

vi.mock('@xnetjs/plugins', () => ({
  detectConnectors: async () => fixture.detections,
  createAIProvider: () => ({ name: 'mock', generate: async () => '' }),
  createManagedProvider: () => ({ name: 'managed', generate: async () => '' }),
  createAiAgentRuntime: () => ({
    load: async () => undefined,
    subscribe: () => () => undefined,
    createThread: async () => ({ id: 't1' }),
    runTurn: async () => ({})
  }),
  createAiSurfaceService: () => ({ createContextPack: async () => ({ resources: [] }) }),
  createPromptApiProvider: async () => null,
  // In-tab tiers: the panel probes Nano availability and offers a download.
  promptApiAvailability: async () => fixture.nanoState,
  downloadPromptApiModel: async () => true
}))

// The WebLLM engine module pulls in @mlc-ai/web-llm lazily; stub it so the test
// never touches the heavy import (the "run" gesture isn't exercised here).
vi.mock('./ai-webllm-engine', () => ({
  buildWebLLMProvider: async () => ({ name: 'webllm', generate: async () => '' })
}))

// The panel reads the workspace store + schema registry to ground replies.
vi.mock('@xnetjs/react/internal', () => ({
  useNodeStore: () => ({ store: { name: 'fake-store' }, isReady: true, error: null }),
  // Conversation persistence (0391) is fire-and-forget; no bridge → no writes.
  useDataBridge: () => null
}))
vi.mock('@xnetjs/data', () => ({
  schemaRegistry: {},
  // Conversation persistence (0391) imports the real schemas; the panel tests
  // only need stable identities, not schema behavior.
  ChannelSchema: { schema: { '@id': 'xnet://xnet.fyi/Channel@1.0.0', name: 'Channel' } },
  ChatMessageSchema: { schema: { '@id': 'xnet://xnet.fyi/ChatMessage@1.0.0', name: 'ChatMessage' } }
}))

// Imported after the mock so the panel binds to the mocked module.
const { AiChatPanel } = await import('./AiChatPanel')

const DEFAULT_DETECTIONS = fixture.detections

afterEach(() => {
  fixture.detections = DEFAULT_DETECTIONS
  fixture.nanoState = 'available'
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

  it('disables the composer until a model is ready, without telling a user with a tier selected to pick one', async () => {
    render(<AiChatPanel />)
    // cloud-key is the selected tier (available in the fixture) but no key is
    // entered, so the runtime never builds → the box stays disabled.
    const box = await screen.findByRole('textbox')
    expect((box as HTMLTextAreaElement).disabled).toBe(true)
    // The old placeholder said "Select and configure a model" even with a tier
    // already selected; it must not anymore.
    expect((box as HTMLTextAreaElement).placeholder).not.toMatch(/select a model/i)
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

  it('gates the in-tab WebLLM download behind a "run" gesture instead of disabling silently', async () => {
    fixture.detections = [
      {
        tier: 'webllm',
        label: 'In-browser model (WebLLM, WebGPU)',
        available: true,
        toolCalling: 'weak',
        preference: 4
      }
    ]
    window.localStorage.setItem('xnet:ai-tier', 'webllm')
    render(<AiChatPanel />)
    // The tier is available, but nothing downloads until the user opts in.
    await waitFor(() => expect(screen.getByText(/Run the in-browser model/)).toBeTruthy())
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(box.disabled).toBe(true)
    expect(box.placeholder).toMatch(/load the model/i)
  })

  it('offers a download gesture when Gemini Nano is downloadable, not just "unavailable"', async () => {
    fixture.detections = [
      {
        tier: 'prompt-api',
        label: 'Chrome built-in AI (Gemini Nano)',
        available: false,
        setupHint: 'Chrome built-in AI not detected.',
        toolCalling: 'none',
        preference: 5
      }
    ]
    fixture.nanoState = 'downloadable'
    window.localStorage.setItem('xnet:ai-tier', 'prompt-api')
    render(<AiChatPanel />)
    await waitFor(() => expect(screen.getByText(/Download Gemini Nano/)).toBeTruthy())
  })
})
