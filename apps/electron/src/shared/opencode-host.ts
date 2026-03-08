/**
 * Shared OpenCode host configuration and status helpers.
 */

import type { ServiceDefinition } from '@xnetjs/plugins'

export const OPENCODE_SERVICE_ID = 'opencode-web' as const
export const DEFAULT_OPENCODE_HOST = '127.0.0.1' as const
export const DEFAULT_OPENCODE_PORT = 4096
export const DEFAULT_OPENCODE_USERNAME = 'opencode' as const
export const OPENCODE_INSTALL_URL = 'https://opencode.ai/docs/install' as const

export const OPENCODE_HOST_IPC_CHANNELS = {
  ENSURE: 'xnet:opencode:ensure',
  STATUS: 'xnet:opencode:status',
  STOP: 'xnet:opencode:stop',
  APPEND_PROMPT: 'xnet:opencode:append-prompt',
  STATUS_CHANGE: 'xnet:opencode:status-change',
  OUTPUT: 'xnet:opencode:output'
} as const

export type OpenCodeAppendPromptInput = {
  prompt: string
}

export type OpenCodeHostConfig = {
  host: string
  port: number
  baseUrl: string
  username: string
  password: string | null
  binaryPathOverride: string | null
}

export type OpenCodeHealthPayload = {
  healthy?: boolean
  version?: string
}

type OpenCodeHostStatusBase = {
  host: string
  port: number
  baseUrl: string
  requiresAuth: boolean
  binaryPath?: string
}

export type OpenCodeHostStatus =
  | (OpenCodeHostStatusBase & {
      state: 'stopped'
    })
  | (OpenCodeHostStatusBase & {
      state: 'starting'
    })
  | (OpenCodeHostStatusBase & {
      state: 'ready'
      pid?: number
      startedAt?: number
      version?: string
    })
  | (OpenCodeHostStatusBase & {
      state: 'missing-binary'
      error: string
      recovery: string
      installUrl: string
    })
  | (OpenCodeHostStatusBase & {
      state: 'error'
      error: string
      recovery?: string
      lastOutput?: string
      pid?: number
    })

export type OpenCodeBinaryResolution =
  | {
      found: true
      path: string
      source: 'override' | 'path' | 'common'
    }
  | {
      found: false
      checkedPaths: string[]
      error: string
      recovery: string
    }

export type OpenCodeHostOutputEvent = {
  serviceId: typeof OPENCODE_SERVICE_ID
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: number
}

const createStatusBase = (
  config: OpenCodeHostConfig,
  binaryPath?: string
): OpenCodeHostStatusBase => ({
  host: config.host,
  port: config.port,
  baseUrl: config.baseUrl,
  requiresAuth: Boolean(config.password),
  ...(binaryPath ? { binaryPath } : {})
})

export const parseOpenCodePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_OPENCODE_PORT
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    return DEFAULT_OPENCODE_PORT
  }

  return parsed
}

export const resolveOpenCodeBaseUrl = (host: string, port: number): string =>
  `http://${host}:${String(port)}`

export const createOpenCodeHostConfig = (
  env: Readonly<Record<string, string | undefined>>
): OpenCodeHostConfig => {
  const host = env.XNET_OPENCODE_HOST?.trim() || DEFAULT_OPENCODE_HOST
  const port = parseOpenCodePort(env.XNET_OPENCODE_PORT)
  return {
    host,
    port,
    baseUrl: resolveOpenCodeBaseUrl(host, port),
    username: env.XNET_OPENCODE_USERNAME?.trim() || DEFAULT_OPENCODE_USERNAME,
    password: env.XNET_OPENCODE_PASSWORD?.trim() || null,
    binaryPathOverride: env.XNET_OPENCODE_BINARY?.trim() || null
  }
}

export const createOpenCodeMissingBinaryRecovery = (binaryPathOverride: string | null): string => {
  const installHint =
    'Install OpenCode from https://opencode.ai/docs/install. macOS: brew install sst/tap/opencode. Linux: curl -fsSL https://opencode.ai/install | bash. Windows: powershell -ExecutionPolicy Bypass -c "irm https://opencode.ai/install.ps1 | iex".'

  if (!binaryPathOverride) {
    return installHint
  }

  return `Check XNET_OPENCODE_BINARY (${binaryPathOverride}) or unset it so xNet can resolve the CLI from PATH. ${installHint}`
}

export const createOpenCodeRuntimeRecovery = (config: OpenCodeHostConfig): string =>
  `Check that the OpenCode CLI can start in web mode and that port ${String(config.port)} is available. If another local instance is already using this port, stop it or set XNET_OPENCODE_PORT to a different value.`

export const createOpenCodeStoppedStatus = (
  config: OpenCodeHostConfig,
  binaryPath?: string
): OpenCodeHostStatus => ({
  state: 'stopped',
  ...createStatusBase(config, binaryPath)
})

export const createOpenCodeStartingStatus = (
  config: OpenCodeHostConfig,
  binaryPath?: string
): OpenCodeHostStatus => ({
  state: 'starting',
  ...createStatusBase(config, binaryPath)
})

export const createOpenCodeReadyStatus = (
  config: OpenCodeHostConfig,
  options: {
    binaryPath?: string
    pid?: number
    startedAt?: number
    version?: string
  } = {}
): OpenCodeHostStatus => ({
  state: 'ready',
  ...createStatusBase(config, options.binaryPath),
  ...(options.pid ? { pid: options.pid } : {}),
  ...(options.startedAt ? { startedAt: options.startedAt } : {}),
  ...(options.version ? { version: options.version } : {})
})

export const createOpenCodeMissingBinaryStatus = (
  config: OpenCodeHostConfig,
  resolution: Extract<OpenCodeBinaryResolution, { found: false }>
): OpenCodeHostStatus => ({
  state: 'missing-binary',
  ...createStatusBase(config),
  error: resolution.error,
  recovery: resolution.recovery,
  installUrl: OPENCODE_INSTALL_URL
})

export const createOpenCodeErrorStatus = (
  config: OpenCodeHostConfig,
  options: {
    binaryPath?: string
    error: string
    recovery?: string
    lastOutput?: string
    pid?: number
  }
): OpenCodeHostStatus => ({
  state: 'error',
  ...createStatusBase(config, options.binaryPath),
  error: options.error,
  ...(options.recovery ? { recovery: options.recovery } : {}),
  ...(options.lastOutput ? { lastOutput: options.lastOutput } : {}),
  ...(options.pid ? { pid: options.pid } : {})
})

export const createOpenCodeServiceDefinition = (
  config: OpenCodeHostConfig & { binaryPath: string }
): ServiceDefinition => ({
  id: OPENCODE_SERVICE_ID,
  name: 'OpenCode Web',
  description: 'Managed local OpenCode web host for the coding workspace',
  process: {
    command: config.binaryPath,
    args: ['web', '--hostname', config.host, '--port', String(config.port)],
    env: {
      BROWSER: 'none',
      ...(config.password
        ? {
            OPENCODE_SERVER_USERNAME: config.username,
            OPENCODE_SERVER_PASSWORD: config.password
          }
        : {})
    }
  },
  lifecycle: {
    restart: 'on-failure',
    maxRestarts: 2,
    restartDelayMs: 1000,
    startTimeoutMs: 30_000,
    shutdownTimeoutMs: 5000,
    healthCheck: {
      type: 'tcp',
      port: config.port,
      timeoutMs: 1000,
      intervalMs: 5000
    }
  },
  communication: {
    protocol: 'http',
    host: config.host,
    port: config.port
  }
})
