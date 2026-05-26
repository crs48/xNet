/**
 * Tests for canvas plugin permission policy helpers.
 */

import { describe, expect, it } from 'vitest'
import {
  createCanvasPluginPermissionPrompt,
  evaluateCanvasPluginPermissionGate,
  normalizeCanvasPluginWorkspacePolicy
} from '../canvas-permissions'

describe('canvas plugin permission gates', () => {
  it('allows default read and render permissions', () => {
    const decision = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      requestedPermissions: ['canvas.read', 'canvas.render']
    })

    expect(decision.status).toBe('allowed')
    expect(decision.allowed).toBe(true)
    expect(decision.grantedPermissions).toEqual(['canvas.read', 'canvas.render'])
    expect(decision.prompt).toBeNull()
  })

  it('requires a prompt for elevated permissions', () => {
    const decision = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-layout',
      contributionName: 'CRM Account Layout',
      requestedPermissions: ['canvas.layout', 'canvas.write']
    })

    expect(decision.status).toBe('prompt-required')
    expect(decision.allowed).toBe(false)
    expect(decision.pendingPermissions).toEqual(['canvas.layout', 'canvas.write'])
    expect(decision.prompt?.title).toBe('Allow CRM Account Layout?')
    expect(decision.prompt?.options.map((option) => option.mode)).toEqual([
      'allow-once',
      'allow-workspace',
      'deny'
    ])
  })

  it('allows trusted plugins to use elevated permissions', () => {
    const decision = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.erp',
      contributionId: 'erp.grid-layout',
      requestedPermissions: ['canvas.layout', 'canvas.write'],
      policy: {
        trustedPluginIds: ['com.example.erp']
      }
    })

    expect(decision.status).toBe('allowed')
    expect(decision.grantedPermissions).toEqual(['canvas.layout', 'canvas.write'])
  })

  it('blocks plugins and permissions denied by workspace policy', () => {
    const decision = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.blocked',
      contributionId: 'blocked.card',
      requestedPermissions: ['clipboard'],
      policy: {
        blockedPluginIds: ['com.example.blocked'],
        blockedPermissions: ['clipboard']
      }
    })

    expect(decision.status).toBe('blocked')
    expect(decision.allowed).toBe(false)
    expect(decision.blockedPermissions).toEqual(['clipboard'])
    expect(decision.issues).toContain("Plugin 'com.example.blocked' is blocked by workspace policy")
  })

  it('prompts for unknown plugins when workspace approval is required', () => {
    const decision = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.new',
      contributionId: 'new.card',
      requestedPermissions: ['canvas.read'],
      policy: {
        allowUnknownPlugins: false
      }
    })

    expect(decision.status).toBe('prompt-required')
    expect(decision.issues).toEqual(["Plugin 'com.example.new' requires workspace approval"])
  })

  it('gates network domains through workspace policy', () => {
    const allowed = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      requestedPermissions: ['network'],
      requestedNetworkDomains: ['https://api.example.com/accounts'],
      policy: {
        trustedPluginIds: ['com.example.crm'],
        allowedNetworkDomains: ['api.example.com']
      }
    })

    expect(allowed.status).toBe('allowed')

    const blocked = evaluateCanvasPluginPermissionGate({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      requestedPermissions: ['network'],
      requestedNetworkDomains: ['tracker.example.com'],
      policy: {
        blockedNetworkDomains: ['tracker.example.com']
      }
    })

    expect(blocked.status).toBe('blocked')
    expect(blocked.blockedNetworkDomains).toEqual(['tracker.example.com'])
  })

  it('creates durable prompt copy and options', () => {
    const prompt = createCanvasPluginPermissionPrompt({
      pluginId: 'com.example.media',
      contributionId: 'media.preview',
      requestedPermissions: ['network'],
      requestedNetworkDomains: ['cdn.example.com']
    })

    expect(prompt.title).toBe('Allow media.preview?')
    expect(prompt.message).toContain('network')
    expect(prompt.message).toContain('cdn.example.com')
    expect(
      prompt.options.find((option) => option.mode === 'allow-workspace')?.persistsDecision
    ).toBe(true)
  })

  it('normalizes workspace policy domains and defaults', () => {
    const policy = normalizeCanvasPluginWorkspacePolicy({
      allowedNetworkDomains: ['HTTPS://API.EXAMPLE.COM/path']
    })

    expect(policy.allowUnknownPlugins).toBe(true)
    expect(policy.allowedPermissions).toEqual(['canvas.read', 'canvas.render'])
    expect(policy.allowedNetworkDomains).toEqual(['api.example.com'])
  })
})
