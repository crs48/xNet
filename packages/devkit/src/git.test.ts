import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeCommandRunner } from './command-runner'
import { Git } from './git'

describe('Git (real temp repo)', () => {
  let dir: string
  let runner: NodeCommandRunner
  let git: Git

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'xnet-devkit-git-'))
    runner = new NodeCommandRunner()
    git = new Git(runner, dir)
    await runner.run('git', ['init', '-b', 'main'], { cwd: dir })
    await runner.run('git', ['config', 'user.email', 'test@xnet.dev'], { cwd: dir })
    await runner.run('git', ['config', 'user.name', 'xNet Test'], { cwd: dir })
    writeFileSync(join(dir, 'README.md'), 'hi\n')
    await git.commit('initial')
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('checkpoints (commits) and reports head/log/clean', async () => {
    expect(await git.isClean()).toBe(true)
    writeFileSync(join(dir, 'a.txt'), 'one\n')
    expect(await git.isClean()).toBe(false)

    const cp = await git.checkpoint('add-a')
    expect(cp.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(await git.isClean()).toBe(true)

    const log = await git.log(5)
    expect(log[0]).toEqual({ sha: cp.sha, label: 'checkpoint: add-a' })
    expect(await git.headSha()).toBe(cp.sha)
    expect(await git.currentBranch()).toBe('main')
  })

  it('restores to a prior checkpoint, discarding later commits + edits', async () => {
    const base = await git.headSha()
    writeFileSync(join(dir, 'b.txt'), 'two\n')
    await git.checkpoint('add-b')
    expect(existsSync(join(dir, 'b.txt'))).toBe(true)

    await git.restore(base)
    expect(await git.headSha()).toBe(base)
    expect(existsSync(join(dir, 'b.txt'))).toBe(false)
  })

  it('resetHard discards untracked files (the rollback path)', async () => {
    writeFileSync(join(dir, 'scratch.txt'), 'junk\n')
    expect(await git.isClean()).toBe(false)
    await git.resetHard()
    expect(existsSync(join(dir, 'scratch.txt'))).toBe(false)
    expect(await git.isClean()).toBe(true)
  })

  it('creates and removes a worktree on a fresh branch', async () => {
    const wtParent = mkdtempSync(join(tmpdir(), 'xnet-devkit-wt-'))
    const wtPath = join(wtParent, 'wt')
    try {
      const wt = await git.worktreeAdd(wtPath, 'agent/x')
      expect(existsSync(wtPath)).toBe(true)
      expect(await wt.currentBranch()).toBe('agent/x')

      writeFileSync(join(wtPath, 'c.txt'), 'three\n')
      const cp = await wt.checkpoint('in-worktree')
      expect(cp.sha).toMatch(/^[0-9a-f]{40}$/)

      await git.worktreeRemove(wtPath)
      expect(existsSync(wtPath)).toBe(false)
    } finally {
      rmSync(wtParent, { recursive: true, force: true })
    }
  })

  it('throws GitError on a bad command', async () => {
    await expect(git.restore('nonexistent-ref-zzz')).rejects.toThrow(/git .* failed/)
  })
})
