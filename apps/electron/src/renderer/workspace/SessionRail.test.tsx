/**
 * @vitest-environment jsdom
 */

import type { SessionSummaryNode } from './state/active-session'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SessionRail } from './SessionRail'

function createSession(overrides: Partial<SessionSummaryNode> = {}): SessionSummaryNode {
  return {
    id: overrides.id ?? 'session-1',
    schemaId: 'xnet://xnet.dev/electron/workspace/WorkspaceSessionSummary@1.0.0',
    createdAt: overrides.createdAt ?? 1,
    createdBy: overrides.createdBy ?? 'did:key:test',
    updatedAt: overrides.updatedAt ?? 2,
    updatedBy: overrides.updatedBy ?? 'did:key:test',
    deleted: false,
    title: overrides.title ?? 'Workspace Session 01',
    branch: overrides.branch ?? 'codex/workspace-session-01',
    worktreeName: overrides.worktreeName ?? 'workspace-session-01',
    worktreePath: overrides.worktreePath ?? '.xnet/worktrees/workspace-session-01',
    openCodeUrl: overrides.openCodeUrl ?? 'http://127.0.0.1:4096',
    changedFilesCount: overrides.changedFilesCount ?? 0,
    state: overrides.state ?? 'idle',
    ...overrides
  }
}

describe('SessionRail', () => {
  it('shows the empty state and create action when there are no sessions', () => {
    const handleCreateSession = vi.fn()

    render(
      <SessionRail
        sessions={[]}
        activeSession={null}
        activeSessionId={null}
        loading={false}
        error={null}
        onCreateSession={handleCreateSession}
        onRemoveSession={vi.fn()}
        onSelectSession={vi.fn()}
      />
    )

    expect(screen.getByText('No coding sessions yet')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create first session' }))

    expect(handleCreateSession).toHaveBeenCalledTimes(1)
  })

  it('renders session groups and selects a session when clicked', () => {
    const handleSelectSession = vi.fn()
    const activeSession = createSession({
      id: 'session-active',
      title: 'Active session',
      branch: 'codex/active',
      state: 'running'
    })
    const otherSession = createSession({
      id: 'session-other',
      title: 'Other session',
      branch: 'codex/other',
      state: 'idle',
      updatedAt: 1
    })

    render(
      <SessionRail
        sessions={[activeSession, otherSession]}
        activeSession={activeSession}
        activeSessionId={activeSession.id}
        loading={false}
        error={null}
        onCreateSession={vi.fn()}
        onRemoveSession={vi.fn()}
        onSelectSession={handleSelectSession}
      />
    )

    expect(screen.getByText('Active Session')).toBeTruthy()
    expect(screen.getByText('Other Sessions')).toBeTruthy()

    fireEvent.click(screen.getByText('Other session · codex/other'))

    expect(handleSelectSession).toHaveBeenCalledWith('session-other')
  })

  it('shows a dirty badge for sessions with local changes', () => {
    render(
      <SessionRail
        sessions={[
          createSession({
            id: 'session-dirty',
            isDirty: true,
            changedFilesCount: 3
          })
        ]}
        activeSession={null}
        activeSessionId={null}
        loading={false}
        error={null}
        onCreateSession={vi.fn()}
        onRemoveSession={vi.fn()}
        onSelectSession={vi.fn()}
      />
    )

    expect(screen.getByText('dirty')).toBeTruthy()
  })
})
