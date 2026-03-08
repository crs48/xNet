/**
 * @vitest-environment jsdom
 */

import type { SessionSummaryNode } from '../state/active-session'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import { ConsentManager, TelemetryCollector, TelemetryProvider } from '@xnetjs/telemetry'
import React, { type ReactNode, useMemo } from 'react'
import { describe, expect, it } from 'vitest'
import { useActiveSession } from './useActiveSession'
import { useSessionCommands } from './useSessionCommands'
import { useSessionSummaries } from './useSessionSummaries'

type WorkspaceHooks = {
  active: ReturnType<typeof useActiveSession>
  commands: ReturnType<typeof useSessionCommands>
  summaries: ReturnType<typeof useSessionSummaries>
}

function createWrapper(storage: MemoryNodeStorageAdapter) {
  const identity = generateIdentity()
  const consent = new ConsentManager()
  consent.setTier('anonymous')
  const collector = new TelemetryCollector({ consent })

  return function Wrapper({ children }: { children: ReactNode }) {
    const stableStorage = useMemo(() => storage, [])

    return (
      <TelemetryProvider consent={consent} collector={collector}>
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: identity.identity.did,
            signingKey: identity.privateKey,
            disableSyncManager: true,
            runtime: {
              mode: 'main-thread',
              fallback: 'main-thread'
            }
          }}
        >
          {children}
        </XNetProvider>
      </TelemetryProvider>
    )
  }
}

function renderWorkspaceHooks(storage = new MemoryNodeStorageAdapter()) {
  return renderHook(
    () => ({
      active: useActiveSession(),
      commands: useSessionCommands(),
      summaries: useSessionSummaries()
    }),
    {
      wrapper: createWrapper(storage)
    }
  )
}

async function waitForWorkspaceReady(result: { current: WorkspaceHooks }) {
  await waitFor(() => {
    expect(result.current.active.loading).toBe(false)
    expect(result.current.active.summariesLoading).toBe(false)
  })
}

function getSessionTitles(summaries: readonly SessionSummaryNode[]): string[] {
  return summaries.map((session) => session.title ?? '')
}

describe('workspace session hooks', () => {
  it('orders denormalized session summaries with the active session first', async () => {
    const { result } = renderWorkspaceHooks()

    await waitForWorkspaceReady(result)

    await act(async () => {
      await result.current.commands.ensureWorkspaceShellState()
    })

    let alphaId = ''

    await act(async () => {
      const alpha = await result.current.commands.createSessionSummary(
        {
          title: 'Alpha',
          branch: 'codex/alpha',
          worktreePath: '/tmp/worktrees/alpha',
          openCodeUrl: 'http://127.0.0.1:4096',
          changedFilesCount: 2
        },
        { select: false }
      )

      alphaId = alpha?.id ?? ''
    })

    await act(async () => {
      await result.current.commands.createSessionSummary({
        title: 'Beta',
        branch: 'codex/beta',
        worktreePath: '/tmp/worktrees/beta',
        openCodeUrl: 'http://127.0.0.1:4096',
        changedFilesCount: 4,
        lastMessagePreview: 'Preview the new shell layout'
      })
    })

    expect(getSessionTitles(result.current.summaries.data)).toEqual(['Beta', 'Alpha'])
    expect(result.current.active.activeSession?.title).toBe('Beta')

    await act(async () => {
      await result.current.commands.selectSession(alphaId)
    })

    expect(result.current.summaries.activeSessionId).toBe(alphaId)
    expect(getSessionTitles(result.current.summaries.data)).toEqual(['Alpha', 'Beta'])
    expect(result.current.active.activeSession?.title).toBe('Alpha')
  })

  it('restores session summaries and active selection from local xNet state after remount', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const initialRender = renderWorkspaceHooks(storage)

    await waitForWorkspaceReady(initialRender.result)

    let restoredId = ''

    await act(async () => {
      await initialRender.result.current.commands.ensureWorkspaceShellState()
      const session = await initialRender.result.current.commands.createSessionSummary({
        title: 'Restored session',
        branch: 'codex/restored-session',
        worktreePath: '/tmp/worktrees/restored-session',
        openCodeUrl: 'http://127.0.0.1:4096',
        previewUrl: 'http://127.0.0.1:5173'
      })

      restoredId = session?.id ?? ''
    })

    expect(initialRender.result.current.active.activeSession?.id).toBe(restoredId)

    initialRender.unmount()

    const remounted = renderWorkspaceHooks(storage)
    await waitForWorkspaceReady(remounted.result)

    expect(remounted.result.current.summaries.data).toHaveLength(1)
    expect(remounted.result.current.summaries.data[0]?.title).toBe('Restored session')
    expect(remounted.result.current.summaries.activeSessionId).toBe(restoredId)
    expect(remounted.result.current.active.activeSession?.id).toBe(restoredId)
  })

  it('upserts runtime snapshots before the session summary exists locally', async () => {
    const { result } = renderWorkspaceHooks()

    await waitForWorkspaceReady(result)

    await act(async () => {
      await result.current.commands.ensureWorkspaceShellState()
    })

    await act(async () => {
      await result.current.commands.applyWorkspaceSessionSnapshot({
        sessionId: 'xnet:workspace-session:race-test',
        title: 'Race Test',
        branch: 'codex/race-test',
        worktreeName: 'race-test',
        worktreePath: '/tmp/worktrees/race-test',
        openCodeUrl: 'http://127.0.0.1:4096',
        previewUrl: 'http://127.0.0.1:4010',
        changedFilesCount: 3,
        state: 'running',
        isDirty: true
      })
    })

    expect(result.current.summaries.data).toHaveLength(1)
    expect(result.current.summaries.data[0]?.id).toBe('xnet:workspace-session:race-test')
    expect(result.current.summaries.data[0]?.title).toBe('Race Test')
    expect(result.current.summaries.data[0]?.branch).toBe('codex/race-test')
    expect(result.current.summaries.data[0]?.changedFilesCount).toBe(3)
    expect(result.current.summaries.data[0]?.isDirty).toBe(true)
  })
})
