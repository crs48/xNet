/**
 * Shared process helpers for harness-driven e2e specs: spawn the hub and
 * the vite harness server, wait for readiness, and tear down cleanly.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process'

export const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')

export function spawnAndWait(
  command: string,
  args: string[],
  opts: {
    cwd: string
    env?: Record<string, string>
    readyText: string
    timeoutMs?: number
    label: string
  }
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${opts.label}: timed out waiting for "${opts.readyText}"`)),
      opts.timeoutMs ?? 30_000
    )

    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true
    })

    let stdout = ''
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (process.env.E2E_DEBUG) process.stderr.write(`[${opts.label}] ${text}`)
      if (stripAnsi(stdout).includes(opts.readyText)) {
        clearTimeout(timer)
        resolve(proc)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      if (process.env.E2E_DEBUG) process.stderr.write(`[${opts.label}:err] ${chunk.toString()}`)
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export function killTree(proc: ChildProcess | undefined): void {
  if (!proc) return
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGTERM')
  } catch {
    try {
      proc.kill('SIGTERM')
    } catch {
      // already dead
    }
  }
}

export function forceFreePorts(ports: number[]): void {
  for (const port of ports) {
    try {
      execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
    } catch {
      // port already clear
    }
  }
}

export async function startHub(port: number): Promise<ChildProcess> {
  return spawnAndWait(
    'pnpm',
    [
      '--filter',
      '@xnetjs/hub',
      'exec',
      'tsx',
      'src/cli.ts',
      '--port',
      String(port),
      '--no-auth',
      '--storage',
      'memory'
    ],
    {
      cwd: ROOT,
      readyText: `listening on port ${port}`,
      label: 'hub',
      timeoutMs: 20_000
    }
  )
}

export async function startHarness(port: number): Promise<ChildProcess> {
  return spawnAndWait('pnpm', ['exec', 'vite', '--config', 'harness/vite.config.ts'], {
    cwd: `${ROOT}/tests/e2e`,
    env: { HARNESS_PORT: String(port) },
    readyText: `localhost:${port}`,
    label: 'harness',
    timeoutMs: 30_000
  })
}
