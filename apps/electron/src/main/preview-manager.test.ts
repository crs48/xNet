import { describe, expect, it } from 'vitest'
import { buildKeepWarmSessionIds, previewRuntimeToWorkspaceState } from './preview-manager'

describe('preview-manager', () => {
  describe('buildKeepWarmSessionIds', () => {
    it('keeps the active and most recent sessions warm by default', () => {
      const keepWarm = buildKeepWarmSessionIds([
        {
          sessionId: 'session-1',
          title: 'Session 1',
          branch: 'codex/session-1',
          worktreeName: 'session-1',
          worktreePath: '/tmp/session-1'
        },
        {
          sessionId: 'session-2',
          title: 'Session 2',
          branch: 'codex/session-2',
          worktreeName: 'session-2',
          worktreePath: '/tmp/session-2'
        },
        {
          sessionId: 'session-3',
          title: 'Session 3',
          branch: 'codex/session-3',
          worktreeName: 'session-3',
          worktreePath: '/tmp/session-3'
        }
      ])

      expect([...keepWarm]).toEqual(['session-1', 'session-2'])
    })
  })

  describe('previewRuntimeToWorkspaceState', () => {
    it('maps runtime states onto renderer session states', () => {
      expect(
        previewRuntimeToWorkspaceState({
          sessionId: 'session-1',
          state: 'starting'
        })
      ).toBe('running')
      expect(
        previewRuntimeToWorkspaceState({
          sessionId: 'session-1',
          state: 'ready',
          url: 'http://127.0.0.1:4310'
        })
      ).toBe('previewing')
      expect(
        previewRuntimeToWorkspaceState({
          sessionId: 'session-1',
          state: 'error',
          lastError: 'boom'
        })
      ).toBe('error')
      expect(
        previewRuntimeToWorkspaceState({
          sessionId: 'session-1',
          state: 'stopped'
        })
      ).toBe('idle')
    })
  })
})
