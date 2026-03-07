import type { ServiceDefinition, ServiceStatus } from '@xnetjs/plugins/node'
import { describe, expect, it, vi } from 'vitest'
import { createOpenCodeHostController } from '../main/opencode-host-controller'
import {
  OPENCODE_SERVICE_ID,
  createOpenCodeHostConfig,
  type OpenCodeBinaryResolution,
  type OpenCodeHostConfig,
  type OpenCodeHostStatus
} from '../shared/opencode-host'

const createServiceStatus = (
  config: OpenCodeHostConfig,
  overrides: Partial<ServiceStatus> = {}
): ServiceStatus => ({
  id: OPENCODE_SERVICE_ID,
  state: 'running',
  port: config.port,
  pid: 4242,
  startedAt: 1,
  restartCount: 0,
  ...overrides
})

const createBinaryResolution = (path: string): OpenCodeBinaryResolution => ({
  found: true,
  path,
  source: 'path'
})

describe('createOpenCodeHostController', () => {
  it('should return a missing-binary status without starting a service', async () => {
    const config = createOpenCodeHostConfig({
      XNET_OPENCODE_PORT: '4100'
    })

    const startService = vi.fn<(_: ServiceDefinition) => Promise<ServiceStatus>>()
    const publishStatus = vi.fn<(status: OpenCodeHostStatus) => void>()

    const controller = createOpenCodeHostController({
      getConfig: () => config,
      getServiceStatus: () => undefined,
      startService,
      restartService: vi.fn(),
      stopService: vi.fn(),
      resolveBinary: vi.fn(async () => ({
        found: false,
        checkedPaths: [],
        error: 'OpenCode CLI was not found on PATH',
        recovery: 'Install OpenCode'
      })),
      probeHealth: vi.fn(async () => null),
      publishStatus
    })

    const status = await controller.ensure()

    expect(status.state).toBe('missing-binary')
    expect(startService).not.toHaveBeenCalled()
    expect(publishStatus).toHaveBeenCalledWith(status)
  })

  it('should dedupe concurrent ensure calls', async () => {
    const config = createOpenCodeHostConfig({
      XNET_OPENCODE_PORT: '4101'
    })

    let serviceStatus: ServiceStatus | undefined
    let resolveStart: ((status: ServiceStatus) => void) | null = null

    const startService = vi.fn(async (_definition: ServiceDefinition) => {
      const nextStatus = await new Promise<ServiceStatus>((resolve) => {
        resolveStart = resolve
      })
      serviceStatus = nextStatus
      return nextStatus
    })

    const controller = createOpenCodeHostController({
      getConfig: () => config,
      getServiceStatus: () => serviceStatus,
      startService,
      restartService: vi.fn(),
      stopService: vi.fn(),
      resolveBinary: vi.fn(async () => createBinaryResolution('/usr/local/bin/opencode')),
      probeHealth: vi.fn(async () => ({ healthy: true, version: '1.0.0' })),
      publishStatus: vi.fn()
    })

    const first = controller.ensure()
    const second = controller.ensure()

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(startService).toHaveBeenCalledTimes(1)

    resolveStart?.(createServiceStatus(config))

    const [firstStatus, secondStatus] = await Promise.all([first, second])

    expect(firstStatus.state).toBe('ready')
    expect(secondStatus).toEqual(firstStatus)
    expect(startService).toHaveBeenCalledTimes(1)
  })

  it('should reuse an existing running service', async () => {
    const config = createOpenCodeHostConfig({
      XNET_OPENCODE_PORT: '4102'
    })

    const serviceStatus = createServiceStatus(config)
    const startService = vi.fn()
    const restartService = vi.fn()

    const controller = createOpenCodeHostController({
      getConfig: () => config,
      getServiceStatus: () => serviceStatus,
      startService,
      restartService,
      stopService: vi.fn(),
      resolveBinary: vi.fn(async () => createBinaryResolution('/usr/local/bin/opencode')),
      probeHealth: vi.fn(async () => ({ healthy: true, version: '1.2.3' })),
      publishStatus: vi.fn()
    })

    const status = await controller.ensure()

    expect(status.state).toBe('ready')
    expect(status.version).toBe('1.2.3')
    expect(startService).not.toHaveBeenCalled()
    expect(restartService).not.toHaveBeenCalled()
  })
})
