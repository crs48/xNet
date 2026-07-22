import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FakeCommandRunner,
  FakeLineRunner,
  NodeCommandRunner,
  NodeLineRunner,
  cmd
} from './command-runner'

describe('FakeCommandRunner', () => {
  it('records calls and replies from the first matching script', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['status']), result: { stdout: ' M a.txt' } },
      { match: cmd('pnpm', ['lint']), result: { code: 1, stderr: 'oops' } }
    ])
    const status = await runner.run('git', ['status', '--porcelain'], { cwd: '/repo' })
    expect(status).toEqual({ ok: true, code: 0, stdout: ' M a.txt', stderr: '' })

    const lint = await runner.run('pnpm', ['lint'], { cwd: '/repo' })
    expect(lint.ok).toBe(false)
    expect(lint.code).toBe(1)

    // Unmatched commands default to success.
    const other = await runner.run('echo', ['hi'], { cwd: '/repo' })
    expect(other.ok).toBe(true)

    expect(runner.calls).toHaveLength(3)
    expect(runner.calls[0]).toEqual({
      command: 'git',
      args: ['status', '--porcelain'],
      cwd: '/repo'
    })
  })

  it('supports a function result', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['rev-parse']), result: (_c, args) => ({ stdout: args.join('-') }) }
    ])
    const r = await runner.run('git', ['rev-parse', 'HEAD'], { cwd: '/repo' })
    expect(r.stdout).toBe('rev-parse-HEAD')
  })
})

describe('NodeCommandRunner (real subprocess)', () => {
  const runner = new NodeCommandRunner()

  it('captures stdout and a zero exit', async () => {
    const r = await runner.run('node', ['-e', "process.stdout.write('hello')"], {
      cwd: process.cwd()
    })
    expect(r.ok).toBe(true)
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('hello')
  })

  it('reports a nonzero exit as not-ok', async () => {
    const r = await runner.run('node', ['-e', 'process.exit(3)'], { cwd: process.cwd() })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(3)
  })

  it('reports a spawn error as code -1', async () => {
    const r = await runner.run('this-binary-does-not-exist-xyz', [], { cwd: process.cwd() })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(-1)
  })

  // Regression: a git hook (husky pre-push) exports GIT_DIR/GIT_WORK_TREE/etc, so
  // git subprocesses spawned under it followed the *hook's* repo instead of the
  // requested `cwd` — clobbering a real worktree and its remote (PR #445, #444).
  describe('git ignores inherited repo-location env so cwd wins', () => {
    let repo: string
    let bogus: string
    const saved: Record<string, string | undefined> = {}

    beforeEach(async () => {
      repo = mkdtempSync(join(tmpdir(), 'xnet-runner-git-'))
      await runner.run('git', ['init', '-b', 'main'], { cwd: repo })
      // A different, non-repo location the leaked env points at.
      bogus = mkdtempSync(join(tmpdir(), 'xnet-runner-bogus-'))
      for (const v of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) saved[v] = process.env[v]
      process.env.GIT_DIR = bogus
      process.env.GIT_WORK_TREE = bogus
      process.env.GIT_INDEX_FILE = join(bogus, 'index')
    })

    afterEach(() => {
      for (const [v, val] of Object.entries(saved)) {
        if (val === undefined) delete process.env[v]
        else process.env[v] = val
      }
      rmSync(repo, { recursive: true, force: true })
      rmSync(bogus, { recursive: true, force: true })
    })

    it('discovers the repo from cwd despite a leaked GIT_DIR', async () => {
      // Without the scrub, GIT_DIR (a non-repo) makes this fatal: "not a git repo".
      const r = await runner.run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repo })
      expect(r.ok).toBe(true)
      expect(r.stdout.trim()).toBe('true')
      expect(r.stderr).not.toMatch(/not a git repository/i)
    })

    it('still lets an explicit options.env override win', async () => {
      // A caller that genuinely wants a different GIT_DIR can pass it; the scrub
      // only removes *inherited* leakage, it does not clobber explicit intent.
      const other = mkdtempSync(join(tmpdir(), 'xnet-runner-explicit-'))
      try {
        await runner.run('git', ['init', '-b', 'main'], { cwd: other })
        writeFileSync(join(other, 'x'), '\n')
        const r = await runner.run('git', ['rev-parse', '--git-dir'], {
          cwd: repo,
          env: { GIT_DIR: join(other, '.git') }
        })
        expect(r.ok).toBe(true)
        expect(r.stdout.trim()).toContain(other)
      } finally {
        rmSync(other, { recursive: true, force: true })
      }
    })
  })
})

describe('NodeLineRunner', () => {
  it('yields stdout lines as they arrive and completes on exit 0', async () => {
    const runner = new NodeLineRunner()
    const lines: string[] = []
    for await (const line of runner.stream(
      process.execPath,
      ['-e', 'console.log("a"); console.log("b")'],
      { cwd: process.cwd() }
    )) {
      lines.push(line)
    }
    expect(lines).toEqual(['a', 'b'])
  })

  it('throws with the stderr tail when the process exits non-zero', async () => {
    const runner = new NodeLineRunner()
    const consume = async (): Promise<void> => {
      for await (const _line of runner.stream(
        process.execPath,
        ['-e', 'console.error("kaput"); process.exit(3)'],
        { cwd: process.cwd() }
      )) {
        // drain
      }
    }
    await expect(consume()).rejects.toThrow(/code 3.*kaput|kaput/s)
  })

  it('kills a silent process after the idle timeout', async () => {
    const runner = new NodeLineRunner()
    const consume = async (): Promise<void> => {
      for await (const _line of runner.stream(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60000)'],
        { cwd: process.cwd(), idleTimeoutMs: 150 }
      )) {
        // drain
      }
    }
    await expect(consume()).rejects.toThrow(/no output for 150ms/)
  }, 10_000)

  it('throws a spawn error for a missing binary', async () => {
    const runner = new NodeLineRunner()
    const consume = async (): Promise<void> => {
      for await (const _line of runner.stream('definitely-not-a-real-binary-xyz', [], {
        cwd: process.cwd()
      })) {
        // drain
      }
    }
    await expect(consume()).rejects.toThrow(/could not spawn/)
  })
})

describe('FakeLineRunner', () => {
  it('records calls and yields scripted lines, then a scripted error', async () => {
    const runner = new FakeLineRunner([
      { match: (c) => c === 'claude', lines: ['l1', 'l2'], error: new Error('after') }
    ])
    const seen: string[] = []
    const consume = async (): Promise<void> => {
      for await (const line of runner.stream('claude', ['-p', 'x'], { cwd: '/ws' })) {
        seen.push(line)
      }
    }
    await expect(consume()).rejects.toThrow('after')
    expect(seen).toEqual(['l1', 'l2'])
    expect(runner.calls[0]).toEqual({ command: 'claude', args: ['-p', 'x'], cwd: '/ws' })
  })
})
