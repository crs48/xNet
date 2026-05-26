/**
 * Tests for canvas plugin renderer and preview sandbox policies.
 */

import type { CanvasCardContribution } from '../contributions'
import { describe, expect, it } from 'vitest'
import {
  createCanvasPluginSandboxPolicy,
  createCanvasPreviewSandboxRequest,
  createCanvasRendererSandboxRequest,
  evaluateCanvasPluginSandboxRequest,
  validateCanvasPluginSandboxOutput
} from '../sandbox/canvas'

function createCardContribution(
  overrides: Partial<CanvasCardContribution> = {}
): CanvasCardContribution {
  return {
    id: 'crm.account-card',
    type: 'canvas.card',
    rendererEntrypoint: 'canvas/cards/account.render',
    previewEntrypoint: 'canvas/cards/account.preview',
    ...overrides
  }
}

describe('canvas plugin sandbox policies', () => {
  it('creates isolated renderer policies', () => {
    const policy = createCanvasPluginSandboxPolicy('renderer', ['network'])

    expect(policy.domAccess).toBe('isolated-iframe')
    expect(policy.networkAccess).toBe('workspace-approved')
    expect(policy.mutationAccess).toBe('none')
    expect(policy.allowedOutputKinds).toEqual(['view-model', 'html-fragment'])
  })

  it('creates deterministic preview policies without DOM or network access', () => {
    const policy = createCanvasPluginSandboxPolicy('preview', ['network'])

    expect(policy.domAccess).toBe('none')
    expect(policy.networkAccess).toBe('none')
    expect(policy.allowedOutputKinds).toEqual(['summary', 'thumbnail', 'template-draft'])
  })

  it('builds sandbox requests from card contributions', () => {
    const contribution = createCardContribution({ permissions: ['canvas.render'] })

    expect(
      createCanvasRendererSandboxRequest({
        pluginId: 'com.example.crm',
        contribution
      })
    ).toMatchObject({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      kind: 'renderer',
      entrypoint: 'canvas/cards/account.render',
      permissions: ['canvas.render']
    })

    expect(
      createCanvasPreviewSandboxRequest({
        pluginId: 'com.example.crm',
        contribution
      })
    ).toMatchObject({
      kind: 'preview',
      entrypoint: 'canvas/cards/account.preview'
    })
  })

  it('allows valid renderer sandbox requests', () => {
    const decision = evaluateCanvasPluginSandboxRequest({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      kind: 'renderer',
      entrypoint: 'canvas/cards/account.render',
      permissions: ['canvas.render', 'network'],
      requestedNetworkDomains: ['api.example.com']
    })

    expect(decision.allowed).toBe(true)
    expect(decision.policy.networkAccess).toBe('workspace-approved')
  })

  it('rejects preview sandbox network and mutation requests', () => {
    const decision = evaluateCanvasPluginSandboxRequest({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      kind: 'preview',
      entrypoint: 'canvas/cards/account.preview',
      permissions: ['canvas.write', 'network']
    })

    expect(decision.allowed).toBe(false)
    expect(decision.issues).toContain('preview sandbox cannot request canvas.write')
    expect(decision.issues).toContain('preview sandbox cannot request network access')
  })

  it('prevents preview workers from exfiltrating restricted blobs', () => {
    const decision = evaluateCanvasPluginSandboxRequest({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      kind: 'preview',
      entrypoint: 'canvas/cards/account.preview',
      permissions: ['storage', 'network'],
      requestedNetworkDomains: ['blob.local']
    })

    expect(decision.allowed).toBe(false)
    expect(decision.issues).toContain('preview sandbox cannot request storage access')
    expect(decision.issues).toContain('preview sandbox cannot request network access')

    const output = validateCanvasPluginSandboxOutput(
      {
        kind: 'html-fragment',
        html: '<iframe src="https://blob.local/export"></iframe>',
        bytes: 64
      },
      createCanvasPluginSandboxPolicy('preview')
    )

    expect(output.valid).toBe(false)
    expect(output.issues).toContain("Output kind 'html-fragment' is not allowed in preview sandbox")
    expect(output.issues).toContain('HTML fragments require an isolated iframe renderer sandbox')
    expect(output.issues).toContain(
      'HTML fragment contains scriptable or nested browsing-context markup'
    )
  })

  it('rejects unsafe entrypoints', () => {
    const decision = evaluateCanvasPluginSandboxRequest({
      pluginId: 'com.example.crm',
      contributionId: 'crm.account-card',
      kind: 'renderer',
      entrypoint: '../cards/account.render'
    })

    expect(decision.allowed).toBe(false)
    expect(decision.issues[0]).toContain('Invalid canvas sandbox entrypoint')
  })

  it('validates renderer output kinds and HTML fragments', () => {
    const policy = createCanvasPluginSandboxPolicy('renderer')

    expect(
      validateCanvasPluginSandboxOutput(
        {
          kind: 'html-fragment',
          html: '<section><strong>Account</strong></section>'
        },
        policy
      )
    ).toEqual({ valid: true, issues: [] })

    const unsafe = validateCanvasPluginSandboxOutput(
      {
        kind: 'html-fragment',
        html: '<img src=x onerror="alert(1)" />'
      },
      policy
    )

    expect(unsafe.valid).toBe(false)
    expect(unsafe.issues[0]).toContain('HTML fragment contains')
  })

  it('validates preview output limits', () => {
    const policy = createCanvasPluginSandboxPolicy('preview')

    expect(
      validateCanvasPluginSandboxOutput(
        {
          kind: 'summary',
          payload: { title: 'Account plan' }
        },
        policy
      ).valid
    ).toBe(true)

    const oversized = validateCanvasPluginSandboxOutput(
      {
        kind: 'summary',
        payload: { title: 'Large output' },
        bytes: policy.maxOutputBytes + 1
      },
      policy
    )

    expect(oversized.valid).toBe(false)
    expect(oversized.issues[0]).toContain('exceeding')
  })
})
