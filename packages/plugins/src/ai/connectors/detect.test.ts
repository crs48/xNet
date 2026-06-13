/**
 * Tests for BYO-Model connector detection (exploration 0174).
 *
 * Pure: every probe is injected, so no GPU / Ollama / key / browser is needed.
 */

import { describe, expect, it } from 'vitest'
import { detectConnectors, pickBestConnector } from './detect'
import { writeModeFor, type ConnectorEnv } from './types'

/** An env where nothing is available, to toggle one tier at a time. */
const NOTHING: ConnectorEnv = {
  hasWebGpu: () => false,
  hasPromptApi: () => false,
  localServerProbes: [],
  hasCloudKey: () => false,
  probeBridge: async () => false
}

describe('detectConnectors', () => {
  it('reports nothing available when all probes are negative', async () => {
    const result = await detectConnectors(NOTHING)
    expect(result.every((d) => !d.available)).toBe(true)
    expect(pickBestConnector(result)).toBeNull()
  })

  it('returns all five tiers, ranked by preference', async () => {
    const result = await detectConnectors(NOTHING)
    expect(result.map((d) => d.tier)).toEqual([
      'bridge',
      'cloud-key',
      'local-server',
      'webllm',
      'prompt-api'
    ])
  })

  it('detects WebGPU for the in-tab tier', async () => {
    const result = await detectConnectors({ ...NOTHING, hasWebGpu: () => true })
    const webllm = result.find((d) => d.tier === 'webllm')
    expect(webllm?.available).toBe(true)
    expect(webllm?.toolCalling).toBe('weak')
  })

  it('detects a reachable local server and reports which one', async () => {
    const result = await detectConnectors({
      ...NOTHING,
      localServerProbes: [
        { label: 'Ollama', baseUrl: 'http://localhost:11434', probe: async () => false },
        { label: 'LM Studio', baseUrl: 'http://localhost:1234', probe: async () => true }
      ]
    })
    const local = result.find((d) => d.tier === 'local-server')
    expect(local?.available).toBe(true)
    expect(local?.detail).toContain('LM Studio')
  })

  it('gives a setup hint when a tier is unavailable', async () => {
    const result = await detectConnectors(NOTHING)
    const local = result.find((d) => d.tier === 'local-server')
    expect(local?.available).toBe(false)
    expect(local?.setupHint).toMatch(/OLLAMA_ORIGINS|CORS/)
  })

  it('detects a healthy bridge daemon and surfaces its url', async () => {
    const result = await detectConnectors({
      ...NOTHING,
      bridgeUrl: 'http://127.0.0.1:31416',
      probeBridge: async () => true
    })
    const bridge = result.find((d) => d.tier === 'bridge')
    expect(bridge?.available).toBe(true)
    expect(bridge?.detail).toBe('http://127.0.0.1:31416')
  })

  it('picks the most-preferred available tier', async () => {
    // Both a local server and a cloud key available → cloud key (D) outranks local (B).
    const result = await detectConnectors({
      ...NOTHING,
      hasCloudKey: () => true,
      localServerProbes: [
        { label: 'Ollama', baseUrl: 'http://localhost:11434', probe: async () => true }
      ]
    })
    expect(pickBestConnector(result)?.tier).toBe('cloud-key')
  })

  it('prefers the bridge above everything when available', async () => {
    const result = await detectConnectors({
      hasWebGpu: () => true,
      hasPromptApi: () => true,
      hasCloudKey: () => true,
      localServerProbes: [
        { label: 'Ollama', baseUrl: 'http://localhost:11434', probe: async () => true }
      ],
      probeBridge: async () => true
    })
    expect(pickBestConnector(result)?.tier).toBe('bridge')
  })

  it('treats a throwing probe as unavailable, not a crash', async () => {
    const result = await detectConnectors({
      ...NOTHING,
      hasWebGpu: () => {
        throw new Error('navigator missing')
      }
    })
    expect(result.find((d) => d.tier === 'webllm')?.available).toBe(false)
  })
})

describe('writeModeFor', () => {
  it('only allows agentic writes for reliable tool calling', () => {
    expect(writeModeFor('reliable')).toBe('agentic')
    expect(writeModeFor('weak')).toBe('propose-only')
    expect(writeModeFor('none')).toBe('propose-only')
  })
})
