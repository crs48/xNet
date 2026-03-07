/**
 * Shared Electron service IPC helpers.
 */

export const SERVICE_IPC_CHANNELS = {
  START: 'xnet:service:start',
  STOP: 'xnet:service:stop',
  RESTART: 'xnet:service:restart',
  STATUS: 'xnet:service:status',
  LIST_ALL: 'xnet:service:list-all',
  CALL: 'xnet:service:call',
  STATUS_UPDATE: 'xnet:service:status-update',
  OUTPUT: 'xnet:service:output'
} as const

export const ALLOWED_SERVICE_CHANNELS = new Set<string>(Object.values(SERVICE_IPC_CHANNELS))

export const isAllowedServiceChannel = (channel: string): boolean =>
  ALLOWED_SERVICE_CHANNELS.has(channel)

export type ServiceIpcChannel = (typeof SERVICE_IPC_CHANNELS)[keyof typeof SERVICE_IPC_CHANNELS]
