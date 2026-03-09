import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { app, ipcMain } from 'electron'

export type StorybookRuntimeState = 'stopped' | 'starting' | 'ready' | 'error'

export type StorybookStatus = {
  state: StorybookRuntimeState
  url?: string
  error?: string
  lastOutput?: string
}

const STORYBOOK_HOST = '127.0.0.1'
const STORYBOOK_PORT = parseInt(process.env.XNET_STORYBOOK_PORT || '6006', 10)
const STORYBOOK_URL = `http://${STORYBOOK_HOST}:${String(STORYBOOK_PORT)}`
const STORYBOOK_READY_TIMEOUT_MS = 30_000
const STORYBOOK_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
let runtimeState: StorybookRuntimeState = 'stopped'
let storybookProcess: ChildProcessWithoutNullStreams | null = null
let lastError: string | null = null
let lastOutput: string | null = null
let ensureTask: Promise<StorybookStatus> | null = null
let stopRequested = false

function getStorybookRepoRoot(): string {
  return resolve(app.getAppPath(), '../..')
}

function normalizeOutput(data: string): string | null {
  const value = data
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)

  return value ?? null
}

function buildStatus(): StorybookStatus {
  return {
    state: runtimeState,
    ...(runtimeState !== 'stopped' ? { url: STORYBOOK_URL } : {}),
    ...(lastError ? { error: lastError } : {}),
    ...(lastOutput ? { lastOutput } : {})
  }
}

async function probeStorybook(): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)

  try {
    const response = await fetch(STORYBOOK_URL, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForStorybookReady(): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < STORYBOOK_READY_TIMEOUT_MS) {
    if (stopRequested) {
      return
    }

    if (await probeStorybook()) {
      return
    }

    await new Promise((resolveNext) => setTimeout(resolveNext, 400))
  }

  throw new Error('Timed out waiting for Storybook to start')
}

async function refreshStatus(): Promise<StorybookStatus> {
  if (!storybookProcess) {
    runtimeState = 'stopped'
    return buildStatus()
  }

  const healthy = await probeStorybook()
  if (healthy) {
    runtimeState = 'ready'
    lastError = null
  } else if (runtimeState === 'ready') {
    runtimeState = 'error'
    lastError = 'Storybook stopped responding'
  }

  return buildStatus()
}

async function ensureStorybook(): Promise<StorybookStatus> {
  if (process.env.NODE_ENV !== 'development') {
    return buildStatus()
  }

  if (storybookProcess && (runtimeState === 'starting' || runtimeState === 'ready')) {
    return refreshStatus()
  }

  if (ensureTask) {
    return ensureTask
  }

  ensureTask = (async () => {
    runtimeState = 'starting'
    lastError = null
    stopRequested = false

    const child = spawn(
      STORYBOOK_COMMAND,
      [
        'exec',
        'storybook',
        'dev',
        '--ci',
        '--no-open',
        '--host',
        STORYBOOK_HOST,
        '--port',
        String(STORYBOOK_PORT)
      ],
      {
        cwd: getStorybookRepoRoot(),
        env: {
          ...process.env,
          BROWSER: 'none',
          CI: '1',
          FORCE_COLOR: '0'
        }
      }
    )

    storybookProcess = child

    child.stdout.on('data', (chunk: Buffer) => {
      const output = normalizeOutput(chunk.toString())
      if (output) {
        lastOutput = output
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const output = normalizeOutput(chunk.toString())
      if (output) {
        lastOutput = output
      }
    })

    child.once('error', (error) => {
      if (stopRequested) {
        runtimeState = 'stopped'
        lastError = null
        return
      }

      runtimeState = 'error'
      lastError = error instanceof Error ? error.message : String(error)
    })

    child.once('exit', (_code, signal) => {
      storybookProcess = null

      if (stopRequested) {
        runtimeState = 'stopped'
        lastError = null
        return
      }

      runtimeState = 'error'
      lastError = signal
        ? `Storybook exited with signal ${signal}`
        : 'Storybook exited unexpectedly'
    })

    try {
      await waitForStorybookReady()
      if (stopRequested) {
        runtimeState = 'stopped'
        lastError = null
      } else {
        runtimeState = 'ready'
        lastError = null
      }
    } catch (error) {
      if (!stopRequested) {
        runtimeState = 'error'
        lastError = error instanceof Error ? error.message : String(error)
      }
    } finally {
      ensureTask = null
    }

    return buildStatus()
  })()

  return ensureTask
}

export async function stopStorybook(): Promise<StorybookStatus> {
  stopRequested = true

  if (!storybookProcess) {
    runtimeState = 'stopped'
    lastError = null
    return buildStatus()
  }

  const child = storybookProcess
  storybookProcess = null

  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
    }, 4000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolveStop()
    })

    child.kill('SIGTERM')
  })

  runtimeState = 'stopped'
  lastError = null
  return buildStatus()
}

export function setupStorybookIPC(): void {
  ipcMain.handle('xnet:storybook:status', async (): Promise<StorybookStatus> => refreshStatus())
  ipcMain.handle('xnet:storybook:ensure', async (): Promise<StorybookStatus> => ensureStorybook())
  ipcMain.handle('xnet:storybook:stop', async (): Promise<StorybookStatus> => stopStorybook())
}
