/**
 * CrashReport schema - OTel-aligned crash/error reporting.
 *
 * Field names follow camelCase versions of OpenTelemetry semantic conventions:
 *   exception.type → exceptionType
 *   exception.message → exceptionMessage
 *   exception.stacktrace → exceptionStacktrace
 */

import { defineSchema, text, select, date } from '@xnet/data'

export const CrashReportSchema = defineSchema({
  name: 'CrashReport',
  namespace: 'xnet://xnet.fyi/telemetry/',
  properties: {
    exceptionType: text({ required: true }),
    exceptionMessage: text({ required: true }),
    exceptionStacktrace: text(),
    codeNamespace: text(),
    codeFunction: text(),
    userAction: text(),
    serviceVersion: text(),
    osType: select({
      options: [
        { id: 'macos', name: 'macOS' },
        { id: 'windows', name: 'Windows' },
        { id: 'linux', name: 'Linux' },
        { id: 'ios', name: 'iOS' },
        { id: 'android', name: 'Android' },
        { id: 'web', name: 'Web' }
      ] as const
    }),
    occurredAt: date(),
    status: select({
      options: [
        { id: 'local', name: 'Local' },
        { id: 'pending', name: 'Pending' },
        { id: 'shared', name: 'Shared' },
        { id: 'dismissed', name: 'Dismissed' }
      ] as const
    }),
    userNotes: text()
  }
})

export type CrashReport = {
  exceptionType: string
  exceptionMessage: string
  exceptionStacktrace?: string
  codeNamespace?: string
  codeFunction?: string
  userAction?: string
  serviceVersion?: string
  osType?: string
  occurredAt?: number
  status?: string
  userNotes?: string
}
