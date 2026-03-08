/**
 * App-local schemas for the Electron coding workspace shell.
 */

import { checkbox, defineSchema, number, relation, select, text } from '@xnetjs/data'

export const SESSION_SUMMARY_STATE_OPTIONS = [
  { id: 'idle', name: 'Idle' },
  { id: 'running', name: 'Running' },
  { id: 'previewing', name: 'Previewing' },
  { id: 'error', name: 'Error' }
] as const

export const SessionSummarySchema = defineSchema({
  name: 'WorkspaceSessionSummary',
  namespace: 'xnet://xnet.dev/electron/workspace/',
  properties: {
    title: text({ required: true }),
    branch: text({ required: true }),
    worktreeName: text({ required: true }),
    worktreePath: text({ required: true }),
    openCodeUrl: text({ required: true }),
    previewUrl: text(),
    lastMessagePreview: text(),
    lastScreenshotPath: text(),
    lastError: text(),
    changedFilesCount: number({ integer: true, min: 0 }),
    isDirty: checkbox({ default: false }),
    state: select({
      options: SESSION_SUMMARY_STATE_OPTIONS,
      default: 'idle'
    }),
    modelId: text()
  }
})

export const WorkspaceShellStateSchema = defineSchema({
  name: 'WorkspaceShellState',
  namespace: 'xnet://xnet.dev/electron/workspace/',
  properties: {
    activeSession: relation({ target: SessionSummarySchema._schemaId })
  }
})
