import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeCommandRunner } from '@xnetjs/devkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  agentEnvironment,
  isSupportedCodex,
  prepareCodex,
  replyModelCatalog
} from './community-agent-runtime'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
describe('installed agent reply policy', () => {
  it('rejects the unrelated PATH codex and untested versions', () => {
    expect(isSupportedCodex('0.2.3')).toBe(false)
    expect(isSupportedCodex('codex-cli 0.162.0-alpha.17.2')).toBe(true)
    expect(isSupportedCodex('codex-cli 0.163.0')).toBe(false)
  })
  it('removes native model tools instead of relying on read-only or a prompt', () => {
    const model = {
      slug: 'test',
      shell_type: 'unified_exec',
      apply_patch_tool_type: 'freeform',
      experimental_supported_tools: ['clock', 'exec_command'],
      multi_agent_version: 'v2',
      node_repl_disabled: false
    }
    const output = replyModelCatalog({ models: [model] }).models[0]
    expect(output).toMatchObject({
      shell_type: 'disabled',
      apply_patch_tool_type: null,
      experimental_supported_tools: [],
      multi_agent_version: null,
      node_repl_disabled: true,
      tool_mode: 'direct'
    })
    expect(model.shell_type).toBe('unified_exec')
    expect(() => replyModelCatalog({ models: [{ slug: 'unknown' }] })).toThrow('Unsupported')
  })
  it('rechecks the executable before trusting a saved compatibility selection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xnet-agent-version-'))
    const run = vi.spyOn(NodeCommandRunner.prototype, 'run').mockResolvedValue({
      ok: true,
      code: 0,
      stdout: 'codex-cli 0.999.0',
      stderr: ''
    })
    try {
      await expect(
        prepareCodex(
          {
            id: 'test',
            provider: 'codex',
            path: '/test/codex',
            version: 'codex-cli 0.162.0-alpha.17.2',
            state: 'available',
            detail: ''
          },
          root
        )
      ).rejects.toThrow('executable changed')
      expect(run).toHaveBeenCalledTimes(1)
      expect(run.mock.calls[0][1]).toEqual(['--version'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('does not inherit cloud credentials or executable injection variables', () => {
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'sentinel')
    vi.stubEnv('NODE_OPTIONS', '--require sentinel')
    vi.stubEnv('OPENAI_API_KEY', 'sentinel')
    const env = agentEnvironment()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.PATH).toBe(process.env.PATH)
  })
})
