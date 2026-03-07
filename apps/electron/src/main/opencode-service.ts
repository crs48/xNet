/**
 * Electron main-process OpenCode host management.
 */

import type { ServiceOutputEvent, ServiceStatusEvent } from '@xnetjs/plugins/node'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import {
  OPENCODE_HOST_IPC_CHANNELS,
  OPENCODE_INSTALL_URL,
  OPENCODE_SERVICE_ID,
  createOpenCodeHostConfig,
  createOpenCodeMissingBinaryRecovery,
  type OpenCodeBinaryResolution,
  type OpenCodeHealthPayload,
  type OpenCodeHostConfig,
  type OpenCodeHostStatus
} from '../shared/opencode-host'
import { createOpenCodeHostController } from './opencode-host-controller'
import { getProcessManager } from './service-ipc'

const OPENCODE_HEALTH_PATH = '/global/health'

let ipcRegistered = false
let serviceEventsRegistered = false

const publishOpenCodeStatus = (status: OpenCodeHostStatus): void => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(OPENCODE_HOST_IPC_CHANNELS.STATUS_CHANGE, status)
  })
}

const publishOpenCodeOutput = (event: ServiceOutputEvent): void => {
  const payload = {
    serviceId: OPENCODE_SERVICE_ID,
    stream: event.stream,
    data: event.data,
    timestamp: event.timestamp
  } as const

  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(OPENCODE_HOST_IPC_CHANNELS.OUTPUT, payload)
  })
}

const controller = createOpenCodeHostController({
  getConfig: () => createOpenCodeHostConfig(process.env),
  getServiceStatus: (serviceId) => getProcessManager().getStatus(serviceId),
  startService: (definition) => getProcessManager().start(definition),
  restartService: (serviceId) => getProcessManager().restart(serviceId),
  stopService: (serviceId) => getProcessManager().stop(serviceId),
  resolveBinary: async (config) => resolveOpenCodeBinary(config),
  probeHealth: async (config) => probeOpenCodeHealth(config),
  publishStatus: publishOpenCodeStatus
})

const isExecutableFile = (path: string): boolean => {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

const getBinaryNames = (): string[] =>
  process.platform === 'win32' ? ['opencode.exe', 'opencode.cmd', 'opencode.bat'] : ['opencode']

const getCommonBinaryLocations = (): string[] => {
  const home = homedir()
  const binaryNames = getBinaryNames()

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    const scoop = join(home, 'scoop', 'shims')
    const base = localAppData ? [join(localAppData, 'Programs')] : []
    return [...base, scoop].flatMap((dir) => binaryNames.map((name) => join(dir, name)))
  }

  const directories =
    process.platform === 'darwin'
      ? ['/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'), join(home, 'bin')]
      : ['/usr/local/bin', '/usr/bin', join(home, '.local', 'bin'), join(home, 'bin')]

  return directories.flatMap((dir) => binaryNames.map((name) => join(dir, name)))
}

const getPathCandidates = (): string[] => {
  const pathDirs = (process.env.PATH || '')
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean)

  return pathDirs.flatMap((dir) => getBinaryNames().map((name) => join(dir, name)))
}

async function resolveOpenCodeBinary(
  config: OpenCodeHostConfig
): Promise<OpenCodeBinaryResolution> {
  const uniqueCandidates = new Set<string>()

  if (config.binaryPathOverride) {
    uniqueCandidates.add(config.binaryPathOverride)
  }

  const pathCandidates = getPathCandidates()
  pathCandidates.forEach((candidate) => uniqueCandidates.add(candidate))

  const commonCandidates = getCommonBinaryLocations()
  commonCandidates.forEach((candidate) => uniqueCandidates.add(candidate))

  for (const candidate of uniqueCandidates) {
    if (!isExecutableFile(candidate)) {
      continue
    }

    if (config.binaryPathOverride && candidate === config.binaryPathOverride) {
      return { found: true, path: candidate, source: 'override' }
    }

    if (pathCandidates.includes(candidate)) {
      return { found: true, path: candidate, source: 'path' }
    }

    return { found: true, path: candidate, source: 'common' }
  }

  return {
    found: false,
    checkedPaths: [...uniqueCandidates],
    error: config.binaryPathOverride
      ? `OpenCode CLI was not found at XNET_OPENCODE_BINARY (${config.binaryPathOverride})`
      : 'OpenCode CLI was not found on PATH',
    recovery: createOpenCodeMissingBinaryRecovery(config.binaryPathOverride)
  }
}

async function probeOpenCodeHealth(
  config: OpenCodeHostConfig
): Promise<OpenCodeHealthPayload | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)

  try {
    const headers = config.password
      ? {
          authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
        }
      : undefined

    const response = await fetch(`${config.baseUrl}${OPENCODE_HEALTH_PATH}`, {
      headers,
      signal: controller.signal
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as OpenCodeHealthPayload
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const registerServiceEventForwarding = (): void => {
  if (serviceEventsRegistered) {
    return
  }

  const manager = getProcessManager()

  manager.on('service:status', (event: ServiceStatusEvent) => {
    if (event.serviceId !== OPENCODE_SERVICE_ID) {
      return
    }

    void controller.refresh()
  })

  manager.on('service:output', (event: ServiceOutputEvent) => {
    if (event.serviceId !== OPENCODE_SERVICE_ID) {
      return
    }

    controller.recordOutput(event)
    publishOpenCodeOutput(event)
  })

  serviceEventsRegistered = true
}

export function setupOpenCodeIPC(): void {
  if (ipcRegistered) {
    return
  }

  registerServiceEventForwarding()

  ipcMain.handle(OPENCODE_HOST_IPC_CHANNELS.ENSURE, async () => controller.ensure())
  ipcMain.handle(OPENCODE_HOST_IPC_CHANNELS.STATUS, async () => controller.status())
  ipcMain.handle(OPENCODE_HOST_IPC_CHANNELS.STOP, async () => controller.stop())

  ipcRegistered = true
}

export async function stopOpenCodeHost(): Promise<void> {
  await controller.stop()
}

export { OPENCODE_INSTALL_URL }
