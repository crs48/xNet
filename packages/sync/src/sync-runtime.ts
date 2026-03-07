/**
 * Sync runtime lifecycle helpers.
 */

export type SyncConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type SyncLifecyclePhase =
  | 'idle'
  | 'starting'
  | 'local-ready'
  | 'connecting'
  | 'healthy'
  | 'degraded'
  | 'replaying'
  | 'stopped'

export type SyncLifecycleInput = {
  started: boolean
  stopped: boolean
  localReady: boolean
  everConnected: boolean
  connectionStatus: SyncConnectionStatus
  replaying?: boolean
}

export type SyncLifecycleState = {
  phase: SyncLifecyclePhase
  connectionStatus: SyncConnectionStatus
  replaying: boolean
  lastTransitionAt: number
}

export function deriveSyncLifecyclePhase(input: SyncLifecycleInput): SyncLifecyclePhase {
  if (input.stopped) {
    return 'stopped'
  }

  if (!input.started) {
    return 'idle'
  }

  if (!input.localReady) {
    return 'starting'
  }

  if (input.connectionStatus === 'connected') {
    return input.replaying ? 'replaying' : 'healthy'
  }

  if (input.connectionStatus === 'connecting') {
    return 'connecting'
  }

  if (input.connectionStatus === 'disconnected') {
    return input.everConnected ? 'degraded' : 'local-ready'
  }

  return 'degraded'
}

export function createSyncLifecycleState(
  input: SyncLifecycleInput,
  previous?: SyncLifecycleState
): SyncLifecycleState {
  const replaying = input.replaying ?? false
  const phase = deriveSyncLifecyclePhase({
    ...input,
    replaying
  })
  const changed =
    !previous ||
    previous.phase !== phase ||
    previous.connectionStatus !== input.connectionStatus ||
    previous.replaying !== replaying

  return {
    phase,
    connectionStatus: input.connectionStatus,
    replaying,
    lastTransitionAt: changed ? Date.now() : previous.lastTransitionAt
  }
}
