import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeAgentRunner } from './agent'
import { FakeCommandRunner, NodeCommandRunner, cmd } from './command-runner'
import { openPullRequest, publishPluginRepo, runAgentTask } from './dev-loop'
import { Git } from './git'

describe('runAgentTask (real temp repo)', () => {
  let dir: string
  let wtParent: string
  let git: Git

  beforeEach(async () => {
    const runner = new NodeCommandRunner()
    dir = mkdtempSync(join(tmpdir(), 'xnet-devkit-loop-'))
    wtParent = mkdtempSync(join(tmpdir(), 'xnet-devkit-loopwt-'))
    git = new Git(runner, dir)
    await runner.run('git', ['init', '-b', 'main'], { cwd: dir })
    await runner.run('git', ['config', 'user.email', 'test@xnet.dev'], { cwd: dir })
    await runner.run('git', ['config', 'user.name', 'xNet Test'], { cwd: dir })
    writeFileSync(join(dir, 'README.md'), 'hi\n')
    await git.commit('initial')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(wtParent, { recursive: true, force: true })
  })

  it('isolates → edits → gate passes → checkpoint on the branch', async () => {
    const wtPath = join(wtParent, 'pass')
    const gate = new FakeCommandRunner() // all gate steps succeed
    const agent = fakeAgentRunner((wd) => writeFileSync(join(wd, 'feature.txt'), 'new\n'))

    const result = await runAgentTask({
      git,
      runner: gate,
      agent,
      task: { id: 'XN-1', prompt: 'add a feature' },
      worktreePath: wtPath,
      gate: [{ name: 'typecheck', command: 'pnpm', args: ['typecheck'] }],
      keepWorktree: true
    })

    expect(result.ok).toBe(true)
    expect(result.rolledBack).toBe(false)
    expect(result.branch).toBe('agent/XN-1')
    expect(result.checkpoint?.label).toBe('XN-1')
    expect(existsSync(join(wtPath, 'feature.txt'))).toBe(true)

    // The checkpoint is a real commit on the worktree's branch.
    const wtGit = new Git(new NodeCommandRunner(), wtPath)
    expect((await wtGit.log(1))[0].label).toBe('checkpoint: XN-1')
    await git.worktreeRemove(wtPath)
  })

  it('rolls back (discards edits) when the gate fails', async () => {
    const wtPath = join(wtParent, 'fail')
    const gate = new FakeCommandRunner([
      { match: cmd('pnpm', ['lint']), result: { code: 1, stderr: 'lint failed' } }
    ])
    const agent = fakeAgentRunner((wd) => writeFileSync(join(wd, 'broken.txt'), 'bad\n'))

    const result = await runAgentTask({
      git,
      runner: gate,
      agent,
      task: { id: 'XN-2', prompt: 'break it' },
      worktreePath: wtPath,
      gate: [
        { name: 'typecheck', command: 'pnpm', args: ['typecheck'] },
        { name: 'lint', command: 'pnpm', args: ['lint'] }
      ],
      keepWorktree: true
    })

    expect(result.ok).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.gate.failedStep).toBe('lint')
    // The agent's edit was discarded by the rollback.
    expect(existsSync(join(wtPath, 'broken.txt'))).toBe(false)
    await git.worktreeRemove(wtPath)
  })

  it('removes the worktree by default but keeps the branch/checkpoint', async () => {
    const wtPath = join(wtParent, 'cleanup')
    const result = await runAgentTask({
      git,
      runner: new FakeCommandRunner(),
      agent: fakeAgentRunner((wd) => writeFileSync(join(wd, 'x.txt'), 'x\n')),
      task: { id: 'XN-3', prompt: 'thing' },
      worktreePath: wtPath,
      gate: []
      // keepWorktree omitted → worktree is cleaned up
    })
    expect(result.ok).toBe(true)
    expect(existsSync(wtPath)).toBe(false) // worktree removed
    // The branch's checkpoint commit still exists in the main repo.
    const branches = await new NodeCommandRunner().run('git', ['branch', '--list', 'agent/XN-3'], {
      cwd: dir
    })
    expect(branches.stdout).toContain('agent/XN-3')
  })
})

describe('openPullRequest', () => {
  it('pushes the branch and opens a PR via gh', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['push']), result: { stdout: '' } },
      { match: cmd('gh', ['pr', 'create']), result: { stdout: 'https://github.com/x/y/pull/1\n' } }
    ])
    const { url } = await openPullRequest(runner, '/tmp/wt', 'agent/XN-1', {
      title: 'feat: thing',
      body: 'body'
    })
    expect(url).toBe('https://github.com/x/y/pull/1')
    const gh = runner.calls.find((c) => c.command === 'gh')
    expect(gh?.args).toContain('--title')
    expect(gh?.args).toContain('--base')
  })

  it('throws when the push fails', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['push']), result: { code: 1, stderr: 'rejected' } }
    ])
    await expect(openPullRequest(runner, '/tmp/wt', 'agent/XN-9')).rejects.toThrow(
      /git push failed/
    )
  })
})

describe('publishPluginRepo', () => {
  it('creates a GitHub repo from the plugin dir and returns its URL', async () => {
    const runner = new FakeCommandRunner([
      {
        match: cmd('gh', ['repo', 'create']),
        result: { stdout: 'https://github.com/alice/xnet-plugin-kanban\n' }
      }
    ])
    const { repoUrl } = await publishPluginRepo(runner, '/tmp/plugin', {
      repo: 'alice/xnet-plugin-kanban'
    })
    expect(repoUrl).toBe('https://github.com/alice/xnet-plugin-kanban')
    const gh = runner.calls.find((c) => c.command === 'gh')
    expect(gh?.args).toEqual([
      'repo',
      'create',
      'alice/xnet-plugin-kanban',
      '--public',
      '--source=.',
      '--remote=origin',
      '--push'
    ])
    expect(gh?.cwd).toBe('/tmp/plugin')
  })

  it('honours private visibility and throws on failure', async () => {
    const ok = new FakeCommandRunner([
      { match: cmd('gh', ['repo', 'create']), result: { stdout: 'https://github.com/a/b\n' } }
    ])
    await publishPluginRepo(ok, '/tmp/p', { repo: 'a/b', visibility: 'private' })
    expect(ok.calls[0].args).toContain('--private')

    const fail = new FakeCommandRunner([
      { match: cmd('gh', ['repo', 'create']), result: { code: 1, stderr: 'name taken' } }
    ])
    await expect(publishPluginRepo(fail, '/tmp/p', { repo: 'a/b' })).rejects.toThrow(
      /gh repo create failed/
    )
  })
})
