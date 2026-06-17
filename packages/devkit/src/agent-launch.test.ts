import { describe, expect, it } from 'vitest'
import { buildAgentArgs, DEFAULT_XNET_ALLOWED_TOOLS, mcpConfigFor } from './agent-launch'

describe('buildAgentArgs', () => {
  it('drives Claude Code headless with plain-text output by default', () => {
    expect(buildAgentArgs('claude')).toEqual(['-p', '{prompt}', '--output-format', 'text'])
  })

  it('adds --mcp-config + --allowedTools when given an MCP config', () => {
    expect(buildAgentArgs('claude', { mcpConfigPath: '/tmp/x.json' })).toEqual([
      '-p',
      '{prompt}',
      '--output-format',
      'text',
      '--mcp-config',
      '/tmp/x.json',
      '--allowedTools',
      DEFAULT_XNET_ALLOWED_TOOLS
    ])
  })

  it('honours a custom allowedTools pattern', () => {
    const args = buildAgentArgs('claude', {
      mcpConfigPath: '/c.json',
      allowedTools: 'mcp__xnet__xnet_search'
    })
    expect(args).toContain('mcp__xnet__xnet_search')
    expect(args).not.toContain(DEFAULT_XNET_ALLOWED_TOOLS)
  })

  it('uses `exec` for Codex (MCP via its global config)', () => {
    expect(buildAgentArgs('codex')).toEqual(['exec', '{prompt}'])
    expect(buildAgentArgs('codex', { mcpConfigPath: '/ignored.json' })).toEqual([
      'exec',
      '{prompt}'
    ])
  })
})

describe('mcpConfigFor', () => {
  it('wraps a server spec under mcpServers.xnet by default', () => {
    expect(mcpConfigFor({ command: 'node', args: ['cli.js', 'mcp', 'serve'] })).toEqual({
      mcpServers: { xnet: { command: 'node', args: ['cli.js', 'mcp', 'serve'] } }
    })
  })

  it('supports a custom server name and copies the args', () => {
    const args = ['mcp', 'serve']
    const config = mcpConfigFor({ command: 'xnet', args }, 'workspace')
    expect(Object.keys(config.mcpServers)).toEqual(['workspace'])
    expect(config.mcpServers.workspace.args).not.toBe(args) // defensive copy
  })
})
