/**
 * @xnetjs/devkit — git as the versioning/rollback spine (exploration 0190).
 *
 * A thin wrapper over `git` (via the `CommandRunner`) that gives the dev loop two
 * things it needs: **isolation** (a worktree per agent task — the Claude Code
 * pattern) and **time travel** (a `checkpoint` is a commit you can `restore` to,
 * the Replit "App History" model). Everything goes through the runner, so it's
 * testable against a real temp repo or a fake.
 */

import type { CommandRunner, CommandResult } from './command-runner'

export class GitError extends Error {
  constructor(
    message: string,
    public readonly result: CommandResult
  ) {
    super(message)
    this.name = 'GitError'
  }
}

/** A restore point — a commit the dev loop can return to. */
export interface GitCheckpoint {
  sha: string
  label: string
}

export class Git {
  constructor(
    private readonly runner: CommandRunner,
    /** The repo (or worktree) directory this instance operates in. */
    readonly cwd: string
  ) {}

  private async git(args: string[]): Promise<CommandResult> {
    return this.runner.run('git', args, { cwd: this.cwd })
  }

  private async out(args: string[]): Promise<string> {
    const r = await this.git(args)
    if (!r.ok) throw new GitError(`git ${args.join(' ')} failed (${r.code}): ${r.stderr.trim()}`, r)
    return r.stdout.trim()
  }

  async currentBranch(): Promise<string> {
    return this.out(['rev-parse', '--abbrev-ref', 'HEAD'])
  }

  async headSha(): Promise<string> {
    return this.out(['rev-parse', 'HEAD'])
  }

  /** Porcelain status lines (empty array = clean tree). */
  async status(): Promise<string[]> {
    const out = await this.out(['status', '--porcelain'])
    return out ? out.split('\n') : []
  }

  async isClean(): Promise<boolean> {
    return (await this.status()).length === 0
  }

  async add(paths: string[] = ['-A']): Promise<void> {
    await this.out(['add', ...paths])
  }

  /**
   * Stage everything and commit. `--no-verify` because agent worktrees often
   * lack `node_modules`, so husky hooks would fail (a known worktree gotcha).
   */
  async commit(message: string): Promise<string> {
    await this.add()
    await this.out(['commit', '-m', message, '--no-verify'])
    return this.headSha()
  }

  /**
   * Discard tracked changes and untracked files back to `ref` — the rollback.
   * `clean -fd` (no `-x`) intentionally PRESERVES gitignored files (e.g.
   * `node_modules`, build output): blowing those away would force a reinstall in
   * a kept worktree. The default loop removes the worktree after a failed run, so
   * any ignored artifacts go with it; on the `keepWorktree`/`restore` paths they
   * survive by design.
   */
  async resetHard(ref = 'HEAD'): Promise<void> {
    await this.out(['reset', '--hard', ref])
    await this.out(['clean', '-fd'])
  }

  /** Add a worktree on a fresh branch and return a `Git` bound to it. */
  async worktreeAdd(path: string, branch: string, base = 'HEAD'): Promise<Git> {
    await this.out(['worktree', 'add', '-b', branch, path, base])
    return new Git(this.runner, path)
  }

  /** Remove a worktree (call on the parent repo's `Git`). The branch survives. */
  async worktreeRemove(path: string): Promise<void> {
    await this.out(['worktree', 'remove', '--force', path])
  }

  async push(branch: string, remote = 'origin'): Promise<void> {
    await this.out(['push', '-u', remote, branch])
  }

  /** Recent commits as `{ sha, label }`. */
  async log(limit = 10): Promise<GitCheckpoint[]> {
    const out = await this.out(['log', `-${limit}`, '--format=%H%x09%s'])
    if (!out) return []
    return out.split('\n').map((line) => {
      const tab = line.indexOf('\t')
      return tab === -1
        ? { sha: line, label: '' }
        : { sha: line.slice(0, tab), label: line.slice(tab + 1) }
    })
  }

  // ── Time travel ────────────────────────────────────────────────────────────

  /** Commit the current state as a named restore point. */
  async checkpoint(label: string): Promise<GitCheckpoint> {
    const sha = await this.commit(`checkpoint: ${label}`)
    return { sha, label }
  }

  /** Return the tree to a prior checkpoint (hard reset). */
  async restore(sha: string): Promise<void> {
    await this.resetHard(sha)
  }
}
