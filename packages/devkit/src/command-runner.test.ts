import { describe, expect, it } from 'vitest'
import { FakeCommandRunner, NodeCommandRunner, cmd } from './command-runner'

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

  it('scrubs inherited git repo-location vars but honours explicit env overrides', async () => {
    // Simulate running inside a git hook (`git commit` exports GIT_INDEX_FILE).
    process.env.GIT_INDEX_FILE = '/parent/repo/.git/index'
    process.env.GIT_DIR = '/parent/repo/.git'
    try {
      const print =
        "process.stdout.write(String(process.env.GIT_INDEX_FILE ?? '') + '|' + String(process.env.GIT_DIR ?? ''))"
      const scrubbed = await runner.run('node', ['-e', print], { cwd: process.cwd() })
      expect(scrubbed.stdout).toBe('|')

      const overridden = await runner.run('node', ['-e', print], {
        cwd: process.cwd(),
        env: { GIT_INDEX_FILE: '/explicit/index' }
      })
      expect(overridden.stdout).toBe('/explicit/index|')
    } finally {
      delete process.env.GIT_INDEX_FILE
      delete process.env.GIT_DIR
    }
  })
})
