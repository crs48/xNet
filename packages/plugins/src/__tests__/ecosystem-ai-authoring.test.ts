/**
 * Tests for the AI-authored plugin transform (exploration 0192).
 */

import type { GeneratedScript } from '../ecosystem/ai-authoring'
import { describe, it, expect, vi } from 'vitest'
import { scriptToPluginManifest, AiAuthoringError } from '../ecosystem/ai-authoring'

const validScript: GeneratedScript = {
  code: 'return rows.length',
  suggestedName: 'Count Rows',
  validated: true,
  explanation: 'Counts the rows in the current view'
}

describe('scriptToPluginManifest', () => {
  it('wraps a validated script into an ai-generated plugin manifest', () => {
    const result = scriptToPluginManifest({ id: 'com.me.counter', script: validScript })
    expect(result.provenance).toBe('ai-generated')
    expect(result.code).toBe('return rows.length')
    expect(result.manifest.id).toBe('com.me.counter')
    expect(result.manifest.name).toBe('Count Rows')
    const command = result.manifest.contributes?.commands?.[0]
    expect(command?.id).toBe('count-rows')
    expect(command?.description).toBe('Counts the rows in the current view')
  })

  it('the command runs the script via the injected executor', () => {
    const run = vi.fn()
    const result = scriptToPluginManifest({ id: 'com.me.counter', script: validScript, run })
    result.manifest.contributes?.commands?.[0].execute()
    expect(run).toHaveBeenCalledWith('return rows.length')
  })

  it('the command throws if no executor is configured', () => {
    const result = scriptToPluginManifest({ id: 'com.me.counter', script: validScript })
    expect(() => result.manifest.contributes?.commands?.[0].execute()).toThrow(AiAuthoringError)
  })

  it('refuses an unvalidated script — "the AI made it" does not bypass the gate', () => {
    expect(() =>
      scriptToPluginManifest({
        id: 'com.me.counter',
        script: { ...validScript, validated: false }
      })
    ).toThrow(AiAuthoringError)
  })

  it('rejects a malformed plugin id', () => {
    expect(() => scriptToPluginManifest({ id: 'bad id', script: validScript })).toThrow(
      AiAuthoringError
    )
  })

  it('carries declared capabilities through to the manifest', () => {
    const result = scriptToPluginManifest({
      id: 'com.me.counter',
      script: validScript,
      capabilities: { schemaRead: ['xnet://xnet.fyi/Task@*'] }
    })
    expect(result.manifest.capabilities?.schemaRead).toEqual(['xnet://xnet.fyi/Task@*'])
  })
})
