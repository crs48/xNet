import { describe, expect, it } from 'vitest'
import { resolveLane } from './blast-radius'
import { FakeCommandRunner, cmd, type LineRunner, type StreamRunOptions } from './command-runner'
import { assertEditable, previewWorktree, probeDevEnvironment, reviewWorktree } from './lane3'

/** A LineRunner that replays scripted output lines. */
function fakeLineRunner(lines: string[], calls: Array<{ args: string[]; cwd: string }> = []) {
  const runner: LineRunner = {
    async *stream(_command: string, args: string[], options: StreamRunOptions) {
      calls.push({ args, cwd: options.cwd })
      for (const line of lines) yield line
    }
  }
  return { runner, calls }
}

describe('probeDevEnvironment', () => {
  it('is ready with a checkout and pnpm', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['rev-parse', '--is-inside-work-tree']), result: { stdout: 'true\n' } }
    ])
    const env = await probeDevEnvironment(runner, '/repo')
    expect(env).toEqual({ checkout: true, pnpm: true, gh: true, ready: true })
  })

  it('is NOT ready without a checkout, and says why', async () => {
    const runner = new FakeCommandRunner([
      {
        match: cmd('git', ['rev-parse', '--is-inside-work-tree']),
        result: { code: 128, stderr: 'not a git repository' }
      }
    ])
    const env = await probeDevEnvironment(runner, '/tmp')
    expect(env.ready).toBe(false)
    expect(env.checkout).toBe(false)
    expect(env.reason).toContain('source checkout')
  })

  it('treats a non-"true" answer as no checkout', async () => {
    // `git rev-parse --is-inside-work-tree` prints `false` inside a bare repo,
    // and exits 0 while doing it — the exit code alone is not the answer.
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['rev-parse', '--is-inside-work-tree']), result: { stdout: 'false\n' } }
    ])
    expect((await probeDevEnvironment(runner, '/bare')).checkout).toBe(false)
  })

  it('is NOT ready without pnpm', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['rev-parse', '--is-inside-work-tree']), result: { stdout: 'true\n' } },
      { match: cmd('pnpm', ['--version']), result: { code: 127, stderr: 'command not found' } }
    ])
    const env = await probeDevEnvironment(runner, '/repo')
    expect(env.ready).toBe(false)
    expect(env.reason).toContain('pnpm')
  })

  it('stays ready when only gh is missing', async () => {
    // A user can run tasks and keep local checkpoints without ever opening a
    // PR; refusing the whole lane for a missing `gh` would be a worse answer.
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['rev-parse', '--is-inside-work-tree']), result: { stdout: 'true\n' } },
      { match: cmd('gh', ['auth', 'status']), result: { code: 1, stderr: 'not logged in' } }
    ])
    const env = await probeDevEnvironment(runner, '/repo')
    expect(env.ready).toBe(true)
    expect(env.gh).toBe(false)
  })
})

describe('assertEditable', () => {
  it('allows an ordinary package', () => {
    expect(assertEditable(resolveLane({ source: 'packages/ui/src/A.tsx:1:1' }))).toEqual({
      editable: true
    })
  })

  it('refuses kernel code even if the incoming resolution claims it is allowed', () => {
    // The verdict arrives from the renderer, which the renderer controls. A
    // check that only runs on the bypassable side is not a check.
    const forged = { ...resolveLane({ source: 'packages/sync/src/change.ts:1:1' }), allowed: true }
    const verdict = assertEditable(forged)
    expect(verdict.editable).toBe(false)
    expect(verdict.code).toBe('kernel')
    expect(verdict.reason).toContain('packages/sync')
  })

  it('refuses a resolution with no usable source', () => {
    const verdict = assertEditable({ ...resolveLane({}), allowed: true })
    expect(verdict.editable).toBe(false)
    expect(verdict.code).toBe('no-source')
  })

  it('refuses lanes that do not belong to the dev loop', () => {
    for (const resolution of [
      resolveLane({ tokenRef: '--accent' }),
      resolveLane({ pluginId: 'p' })
    ]) {
      const verdict = assertEditable(resolution)
      expect(verdict.editable).toBe(false)
      expect(verdict.code).toBe('wrong-lane')
    }
  })

  it('passes a refusal sentence through when the lane is right but not allowed', () => {
    const resolution = { ...resolveLane({ source: 'packages/ui/src/A.tsx:1:1' }), allowed: false }
    const verdict = assertEditable(resolution)
    expect(verdict.editable).toBe(false)
    expect(verdict.code).toBe('not-allowed')
    expect(verdict.reason).toBe(resolution.explain)
  })
})

describe('previewWorktree', () => {
  it('refuses to bind the session’s own port', async () => {
    const { runner } = fakeLineRunner([])
    // Sharing the port is how a broken edit takes down the surface you are
    // editing from — the exact hazard the whole lane is designed around.
    await expect(previewWorktree(runner, '/wt', 5173, { port: 5173 })).rejects.toThrow(
      /session's own port/
    )
  })

  it('resolves on the readiness line for the requested port', async () => {
    const { runner, calls } = fakeLineRunner([
      'VITE v5.4.21  ready in 900 ms',
      '  ➜  Local:   http://localhost:5219/'
    ])
    const preview = await previewWorktree(runner, '/wt', 5173, { port: 5219 })
    expect(preview.url).toBe('http://localhost:5219')
    expect(calls[0].cwd).toBe('/wt')
    expect(calls[0].args).toContain('--strictPort')
    expect(calls[0].args).toContain('5219')
  })

  it('ignores a readiness line for a different port', async () => {
    // Another dev server's banner in the same output must not be mistaken for
    // ours, or the user gets a URL serving the wrong tree.
    const { runner } = fakeLineRunner(['  ➜  Local:   http://localhost:5173/'])
    await expect(previewWorktree(runner, '/wt', 4444, { port: 5219 })).rejects.toThrow(
      /never reported a URL on port 5219/
    )
  })

  it('rejects when the server exits without ever becoming ready', async () => {
    const { runner } = fakeLineRunner(['error: port already in use'])
    await expect(previewWorktree(runner, '/wt', 4444, { port: 5219 })).rejects.toThrow(
      /never reported a URL/
    )
  })

  it('runs the requested package filter', async () => {
    const { runner, calls } = fakeLineRunner(['  ➜  Local:   http://localhost:5219/'])
    await previewWorktree(runner, '/wt', 4444, { port: 5219, filter: 'xnet-demos' })
    expect(calls[0].args).toContain('xnet-demos')
  })
})

describe('reviewWorktree', () => {
  const steps = [{ name: 'typecheck', command: 'pnpm', args: ['typecheck'] }]

  it('collects the diff, the file list, and the gate result', async () => {
    const runner = new FakeCommandRunner([
      { match: cmd('git', ['diff', 'main...HEAD']), result: { stdout: 'diff --git a/x b/x\n' } },
      {
        match: cmd('git', ['diff', '--name-only', 'main...HEAD']),
        result: { stdout: 'packages/ui/src/A.tsx\n' }
      }
    ])
    const review = await reviewWorktree(runner, '/wt', 'main', steps)
    expect(review.diff).toContain('diff --git')
    expect(review.files).toEqual(['packages/ui/src/A.tsx'])
    expect(review.gate.ok).toBe(true)
    expect(review.prReady).toBe(true)
  })

  it('is NOT PR-ready when the gate failed', async () => {
    const runner = new FakeCommandRunner([
      {
        match: cmd('git', ['diff', '--name-only', 'main...HEAD']),
        result: { stdout: 'packages/ui/src/A.tsx\n' }
      },
      { match: cmd('pnpm', ['typecheck']), result: { code: 2, stderr: 'TS2345' } }
    ])
    const review = await reviewWorktree(runner, '/wt', 'main', steps)
    expect(review.gate.ok).toBe(false)
    expect(review.prReady).toBe(false)
  })

  it('is NOT PR-ready when the agent changed nothing', async () => {
    // A green gate over an empty diff is a task that did nothing. Offering a PR
    // there wastes a reviewer's time on a no-op.
    const runner = new FakeCommandRunner()
    const review = await reviewWorktree(runner, '/wt', 'main', steps)
    expect(review.files).toEqual([])
    expect(review.gate.ok).toBe(true)
    expect(review.prReady).toBe(false)
  })
})
