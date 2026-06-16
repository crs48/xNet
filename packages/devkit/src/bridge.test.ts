import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeAgentRunner } from './agent'
import { bridgeHealth, handleBridgeRun } from './bridge'
import { FakeCommandRunner, NodeCommandRunner } from './command-runner'
import { Git } from './git'

describe('bridgeHealth', () => {
  it('returns the payload the connector ladder probes for', () => {
    expect(bridgeHealth({ agent: 'claude', version: '1.2.3' })).toEqual({
      ok: true,
      service: 'xnet-agent-bridge',
      agent: 'claude',
      version: '1.2.3'
    })
  })
})

describe('handleBridgeRun (real temp repo)', () => {
  let dir: string
  let wtRoot: string
  let git: Git

  beforeEach(async () => {
    const runner = new NodeCommandRunner()
    dir = mkdtempSync(join(tmpdir(), 'xnet-devkit-bridge-'))
    wtRoot = mkdtempSync(join(tmpdir(), 'xnet-devkit-bridgewt-'))
    git = new Git(runner, dir)
    await runner.run('git', ['init', '-b', 'main'], { cwd: dir })
    await runner.run('git', ['config', 'user.email', 'test@xnet.dev'], { cwd: dir })
    await runner.run('git', ['config', 'user.name', 'xNet Test'], { cwd: dir })
    writeFileSync(join(dir, 'README.md'), 'hi\n')
    await git.commit('initial')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(wtRoot, { recursive: true, force: true })
  })

  it('runs the dev loop in a per-task worktree under worktreeRoot', async () => {
    const result = await handleBridgeRun(
      {
        git,
        runner: new FakeCommandRunner(), // gate passes
        agent: fakeAgentRunner((wd) => writeFileSync(join(wd, 'fix.txt'), 'done\n')),
        gate: [{ name: 'typecheck', command: 'pnpm', args: ['typecheck'] }],
        worktreeRoot: wtRoot
      },
      { taskId: 'XN-42', prompt: 'fix the bug' }
    )

    expect(result.ok).toBe(true)
    expect(result.branch).toBe('agent/XN-42')
    expect(result.checkpoint?.label).toBe('XN-42')
    expect(existsSync(join(wtRoot, 'XN-42', 'fix.txt'))).toBe(true)
    await git.worktreeRemove(join(wtRoot, 'XN-42'))
  })
})
