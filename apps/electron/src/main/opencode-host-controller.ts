/**
 * OpenCode host controller for Electron main.
 */

import type { ServiceDefinition, ServiceOutputEvent, ServiceStatus } from '@xnetjs/plugins/node'
import {
  OPENCODE_SERVICE_ID,
  createOpenCodeErrorStatus,
  createOpenCodeMissingBinaryStatus,
  createOpenCodeReadyStatus,
  createOpenCodeRuntimeRecovery,
  createOpenCodeServiceDefinition,
  createOpenCodeStartingStatus,
  createOpenCodeStoppedStatus,
  type OpenCodeBinaryResolution,
  type OpenCodeHealthPayload,
  type OpenCodeHostConfig,
  type OpenCodeHostStatus
} from '../shared/opencode-host'

export type OpenCodeHostController = {
  ensure(): Promise<OpenCodeHostStatus>
  status(): Promise<OpenCodeHostStatus>
  stop(): Promise<OpenCodeHostStatus>
  refresh(): Promise<OpenCodeHostStatus>
  recordOutput(event: ServiceOutputEvent): void
}

type OpenCodeHostControllerDependencies = {
  getConfig(): OpenCodeHostConfig
  getServiceStatus(serviceId: string): ServiceStatus | undefined
  startService(definition: ServiceDefinition): Promise<ServiceStatus>
  restartService(serviceId: string): Promise<ServiceStatus>
  stopService(serviceId: string): Promise<void>
  resolveBinary(config: OpenCodeHostConfig): Promise<OpenCodeBinaryResolution>
  probeHealth(config: OpenCodeHostConfig): Promise<OpenCodeHealthPayload | null>
  publishStatus(status: OpenCodeHostStatus): void
}

type OpenCodeHostRuntimeState = {
  binaryPath?: string
  lastError?: string
  lastOutput?: string
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const normalizeOutput = (data: string): string | undefined => {
  const value = data.trim()
  return value ? value : undefined
}

export function createOpenCodeHostController(
  deps: OpenCodeHostControllerDependencies
): OpenCodeHostController {
  const runtime: OpenCodeHostRuntimeState = {}
  let ensurePromise: Promise<OpenCodeHostStatus> | null = null

  const buildIdleStatus = async (config: OpenCodeHostConfig): Promise<OpenCodeHostStatus> => {
    const resolution = await deps.resolveBinary(config)

    if (!resolution.found) {
      runtime.binaryPath = undefined
      return createOpenCodeMissingBinaryStatus(config, resolution)
    }

    runtime.binaryPath = resolution.path
    return createOpenCodeStoppedStatus(config, resolution.path)
  }

  const buildStatusFromService = async (
    config: OpenCodeHostConfig,
    serviceStatus?: ServiceStatus
  ): Promise<OpenCodeHostStatus> => {
    if (!serviceStatus) {
      return buildIdleStatus(config)
    }

    switch (serviceStatus.state) {
      case 'running': {
        const health = await deps.probeHealth(config).catch(() => null)
        return createOpenCodeReadyStatus(config, {
          binaryPath: runtime.binaryPath,
          pid: serviceStatus.pid,
          startedAt: serviceStatus.startedAt,
          version: health?.version
        })
      }

      case 'starting':
      case 'stopping':
        return createOpenCodeStartingStatus(config, runtime.binaryPath)

      case 'error':
        return createOpenCodeErrorStatus(config, {
          binaryPath: runtime.binaryPath,
          error: serviceStatus.lastError ?? runtime.lastError ?? 'OpenCode failed to start',
          recovery: createOpenCodeRuntimeRecovery(config),
          lastOutput: runtime.lastOutput,
          pid: serviceStatus.pid
        })

      case 'stopped':
      default:
        return buildIdleStatus(config)
    }
  }

  const publish = (status: OpenCodeHostStatus): OpenCodeHostStatus => {
    deps.publishStatus(status)
    return status
  }

  const status = async (): Promise<OpenCodeHostStatus> => {
    const config = deps.getConfig()
    const current = deps.getServiceStatus(OPENCODE_SERVICE_ID)
    return buildStatusFromService(config, current)
  }

  const refresh = async (): Promise<OpenCodeHostStatus> => publish(await status())

  const ensure = async (): Promise<OpenCodeHostStatus> => {
    const current = deps.getServiceStatus(OPENCODE_SERVICE_ID)
    if (current && current.state !== 'error') {
      return refresh()
    }

    if (ensurePromise) {
      return ensurePromise
    }

    const config = deps.getConfig()

    ensurePromise = (async () => {
      const resolution = await deps.resolveBinary(config)

      if (!resolution.found) {
        runtime.binaryPath = undefined
        return publish(createOpenCodeMissingBinaryStatus(config, resolution))
      }

      runtime.binaryPath = resolution.path
      runtime.lastError = undefined
      publish(createOpenCodeStartingStatus(config, resolution.path))

      try {
        const nextServiceStatus = current
          ? await deps.restartService(OPENCODE_SERVICE_ID)
          : await deps.startService(
              createOpenCodeServiceDefinition({ ...config, binaryPath: resolution.path })
            )

        const nextStatus = await buildStatusFromService(config, nextServiceStatus)
        return publish(nextStatus)
      } catch (error) {
        const message = getErrorMessage(error)
        runtime.lastError = message
        return publish(
          createOpenCodeErrorStatus(config, {
            binaryPath: resolution.path,
            error: message,
            recovery: createOpenCodeRuntimeRecovery(config),
            lastOutput: runtime.lastOutput
          })
        )
      } finally {
        ensurePromise = null
      }
    })()

    return ensurePromise
  }

  const stop = async (): Promise<OpenCodeHostStatus> => {
    const config = deps.getConfig()
    const current = deps.getServiceStatus(OPENCODE_SERVICE_ID)

    if (current) {
      await deps.stopService(OPENCODE_SERVICE_ID)
    }

    runtime.lastError = undefined
    runtime.lastOutput = undefined
    return publish(createOpenCodeStoppedStatus(config, runtime.binaryPath))
  }

  const recordOutput = (event: ServiceOutputEvent): void => {
    if (event.serviceId !== OPENCODE_SERVICE_ID) {
      return
    }

    const normalized = normalizeOutput(event.data)
    if (!normalized) {
      return
    }

    runtime.lastOutput = normalized
  }

  return {
    ensure,
    status,
    stop,
    refresh,
    recordOutput
  }
}
