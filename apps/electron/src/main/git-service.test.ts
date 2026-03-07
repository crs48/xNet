import { describe, expect, it } from 'vitest'
import {
  deriveWorktreeContainerPath,
  deriveWorktreeName,
  isManagedWorktreePath,
  parseGitStatusSummary,
  parseWorktreeListOutput
} from './git-service'

describe('git-service', () => {
  describe('parseWorktreeListOutput', () => {
    it('parses porcelain worktree output', () => {
      const output = [
        'worktree /tmp/xnet',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /tmp/xnet-feature',
        'HEAD def456',
        'branch refs/heads/codex/layout-pass',
        'locked',
        ''
      ].join('\n')

      expect(parseWorktreeListOutput(output)).toEqual([
        {
          path: '/tmp/xnet',
          head: 'abc123',
          branch: 'main',
          bare: false,
          detached: false,
          locked: false,
          prunable: false
        },
        {
          path: '/tmp/xnet-feature',
          head: 'def456',
          branch: 'codex/layout-pass',
          bare: false,
          detached: false,
          locked: true,
          prunable: false
        }
      ])
    })

    it('ignores unexpected branch formats instead of slicing corrupt names', () => {
      const output = ['worktree /tmp/xnet', 'HEAD abc123', 'branch detached-head', ''].join('\n')

      expect(parseWorktreeListOutput(output)).toEqual([
        {
          path: '/tmp/xnet',
          head: 'abc123',
          branch: null,
          bare: false,
          detached: false,
          locked: false,
          prunable: false
        }
      ])
    })
  })

  describe('parseGitStatusSummary', () => {
    it('counts unique changed files', () => {
      const output = [
        'M  apps/electron/src/main/index.ts',
        '?? docs/notes.md',
        'M  docs/notes.md'
      ].join('\n')

      expect(parseGitStatusSummary(output)).toEqual({
        changedFilesCount: 2,
        isDirty: true,
        files: ['apps/electron/src/main/index.ts', 'docs/notes.md']
      })
    })
  })

  describe('deriveWorktreeName', () => {
    it('builds a stable worktree name from the branch and session id', () => {
      expect(deriveWorktreeName('codex/layout-pass', 'xnet:workspace-session:abc123')).toBe(
        'layout-pass-xnet-wor'
      )
    })
  })

  describe('managed worktree paths', () => {
    it('derives the managed worktree container from the repo root', () => {
      expect(deriveWorktreeContainerPath('/Users/crs/src/xNet')).toBe(
        '/Users/crs/src/.xnet-worktrees/xnet'
      )
    })

    it('accepts only worktrees inside the managed container', () => {
      const repoRoot = '/Users/crs/src/xNet'

      expect(
        isManagedWorktreePath(repoRoot, '/Users/crs/src/.xnet-worktrees/xnet/layout-pass-xnet-wor')
      ).toBe(true)
      expect(isManagedWorktreePath(repoRoot, '/Users/crs/src/xNet')).toBe(false)
      expect(isManagedWorktreePath(repoRoot, '/tmp/layout-pass-xnet-wor')).toBe(false)
    })
  })
})
