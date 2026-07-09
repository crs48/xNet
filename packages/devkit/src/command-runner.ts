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

/**
 * Repo-location env vars that `git` exports into hook subprocesses (e.g.
 * `git commit` sets GIT_INDEX_FILE for pre-commit hooks). If a devkit process
 * runs inside a hook and inherits these, every spawned `git` is silently
 * redirected at the hook's repo instead of the `cwd` the caller asked for —
 * temp-repo tests and agent worktrees break with errors like
 * ".git/index: index file open failed: Not a directory". The runner drops them
 * from the inherited env; a caller that really wants one can still set it
 * explicitly via `options.env`.
 */
const GIT_REPO_LOCATION_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_PREFIX'
] as const

function sanitizedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of GIT_REPO_LOCATION_VARS) delete env[key]
  return env
}

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

/** Spawns real subprocesses. Node-only (Electron main / CLI / tests). */
export class NodeCommandRunner implements CommandRunner {
  run(command: string, args: string[], options: RunOptions): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...sanitizedEnv(), ...options.env },
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
