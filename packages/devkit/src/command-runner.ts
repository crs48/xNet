/**
 * @xnetjs/devkit — the command-runner port.
 *
 * Every shell-touching operation (git, the validation gate, the coding-agent
 * CLI) goes through one narrow `CommandRunner` interface. The `NodeCommandRunner`
 * spawns real subprocesses (Electron main / the CLI); the `FakeCommandRunner`
 * scripts responses for deterministic tests. This is the seam that keeps the
 * whole dev loop unit-testable without spawning anything.
 */

import { spawn } from 'node:child_process'

export interface CommandResult {
  /** `true` when the process exited 0. */
  ok: boolean
  /** Exit code (`-1` if the process could not be spawned). */
  code: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  /** Working directory — required, so a caller can never accidentally run in `process.cwd()`. */
  cwd: string
  /** Extra env on top of the parent process env. */
  env?: Record<string, string | undefined>
  /** Optional stdin. */
  input?: string
  /** Kill the process after this many ms (0 = no timeout). */
  timeoutMs?: number
}

export interface CommandRunner {
  run(command: string, args: string[], options: RunOptions): Promise<CommandResult>
}

/**
 * Repo-location env vars that git reads INSTEAD of discovering the repo from the
 * working directory. A git hook (husky `pre-commit`/`pre-push`) exports these
 * pointing at the *hook's* repo, so any `git` subprocess spawned while a hook
 * runs — the dev loop, or this package's own tests under `pnpm test` — would
 * silently operate on that repo despite an explicit `cwd`. That defeats the very
 * isolation the required `cwd` exists to guarantee, and has clobbered a real
 * worktree *and its remote* (the `git config`/`commit`/`push` all misdirected).
 * We neutralise them for every `git` invocation so `cwd` is always authoritative;
 * an explicit `options.env` entry still wins (it is spread last).
 */
export const GIT_LOCATION_ENV = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
  'GIT_PREFIX'
])

/** Spawns real subprocesses. Node-only (Electron main / CLI / tests). */
export class NodeCommandRunner implements CommandRunner {
  run(command: string, args: string[], options: RunOptions): Promise<CommandResult> {
    return new Promise((resolve) => {
      // For `git`, drop any inherited repo-location env so `cwd` wins (see
      // GIT_LOCATION_ENV). Values left `undefined` are omitted by spawn.
      const scrub: Record<string, string | undefined> = {}
      if (command === 'git') for (const key of GIT_LOCATION_ENV) scrub[key] = undefined
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...scrub, ...options.env },
        shell: false // never interpret the command through a shell
      })
      let stdout = ''
      let stderr = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      if (options.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
      }
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString()
      })
      if (options.input !== undefined) {
        child.stdin?.write(options.input)
        child.stdin?.end()
      }
      child.on('error', (err) => {
        if (timer) clearTimeout(timer)
        resolve({ ok: false, code: -1, stdout, stderr: stderr + String(err) })
      })
      child.on('close', (code) => {
        if (timer) clearTimeout(timer)
        resolve({ ok: code === 0, code: code ?? -1, stdout, stderr })
      })
    })
  }
}

/** One scripted response for the fake runner. */
export interface FakeCommandScript {
  /** Return true to handle this invocation. */
  match: (command: string, args: string[]) => boolean
  /** The result (or a function of the invocation). `code` defaults to 0. */
  result: Partial<CommandResult> | ((command: string, args: string[]) => Partial<CommandResult>)
}

/** Deterministic runner for tests — records every call, replies from scripts. */
export class FakeCommandRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[]; cwd: string }> = []

  constructor(private readonly scripts: FakeCommandScript[] = []) {}

  async run(command: string, args: string[], options: RunOptions): Promise<CommandResult> {
    this.calls.push({ command, args: [...args], cwd: options.cwd })
    const script = this.scripts.find((s) => s.match(command, args))
    const partial = script
      ? typeof script.result === 'function'
        ? script.result(command, args)
        : script.result
      : {}
    const code = partial.code ?? 0
    return { ok: code === 0, code, stdout: partial.stdout ?? '', stderr: partial.stderr ?? '' }
  }
}

/** Convenience matcher: command + a prefix of args (e.g. `cmd('git', ['commit'])`). */
export function cmd(command: string, argPrefix: string[] = []): FakeCommandScript['match'] {
  return (c, args) => c === command && argPrefix.every((a, i) => args[i] === a)
}
