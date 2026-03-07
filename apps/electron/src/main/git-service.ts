/**
 * Thin git CLI wrappers for coding-workspace sessions.
 */

import { execFile } from 'node:child_process'
import { access, constants, cp, mkdir, symlink } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  normalizeWorkspaceBranchSlug,
  sanitizeWorkspaceBranchSegment,
  WORKSPACE_SESSION_BRANCH_PREFIX
} from '../shared/workspace-session'

const execFileAsync = promisify(execFile)

const WORKTREE_CONTAINER_DIRNAME = '.xnet-worktrees'
const WORKTREE_BOOTSTRAP_MARKER = '.xnet-workspace-bootstrap'

export type WorktreeInfo = {
  path: string
  head: string | null
  branch: string | null
  bare: boolean
  detached: boolean
  locked: boolean
  prunable: boolean
}

export type GitStatusSummary = {
  changedFilesCount: number
  isDirty: boolean
  files: string[]
}

export type GitRepoContext = {
  repoRoot: string
  baseRef: string
  currentBranch: string | null
}

export type GitSessionInput = {
  sessionId: string
  title: string
  branchSlug?: string | null
  baseRef?: string | null
}

export type CreatedWorktree = {
  repoRoot: string
  baseRef: string
  branch: string
  worktreeName: string
  worktreePath: string
}

type GitServiceOptions = {
  repoRootOverride?: string | null
}

type CommandResult = {
  stdout: string
  stderr: string
}

type ParsedWorktreeEntry = Partial<WorktreeInfo> & {
  path?: string
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const trimCommandOutput = (value: string): string => value.trim()

const uniqueStrings = (values: readonly string[]): string[] => [...new Set(values)]

async function copyNodeModulesSkeleton(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await fileExists(sourcePath)) || (await fileExists(targetPath))) {
    return
  }

  await cp(sourcePath, targetPath, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    filter: (entry) => {
      const pnpmStorePath = join(sourcePath, '.pnpm')
      return entry !== pnpmStorePath && !entry.startsWith(`${pnpmStorePath}${sep}`)
    }
  })

  const sourcePnpmStore = join(sourcePath, '.pnpm')
  const targetPnpmStore = join(targetPath, '.pnpm')
  if (await fileExists(sourcePnpmStore)) {
    await symlink(sourcePnpmStore, targetPnpmStore, 'dir')
  }
}

async function bootstrapWorktreeNodeModules(
  sourceRepoRoot: string,
  worktreePath: string
): Promise<void> {
  const markerPath = join(worktreePath, WORKTREE_BOOTSTRAP_MARKER)
  if (await fileExists(markerPath)) {
    return
  }

  await copyNodeModulesSkeleton(
    join(sourceRepoRoot, 'node_modules'),
    join(worktreePath, 'node_modules')
  )
  await copyNodeModulesSkeleton(
    join(sourceRepoRoot, 'apps', 'web', 'node_modules'),
    join(worktreePath, 'apps', 'web', 'node_modules')
  )
  await copyNodeModulesSkeleton(
    join(sourceRepoRoot, 'apps', 'electron', 'node_modules'),
    join(worktreePath, 'apps', 'electron', 'node_modules')
  )

  await mkdir(markerPath, { recursive: true })
}

export function parseWorktreeListOutput(output: string): WorktreeInfo[] {
  const lines = output.split('\n')
  const entries: ParsedWorktreeEntry[] = []
  let current: ParsedWorktreeEntry = {}

  const pushCurrent = (): void => {
    if (!current.path) {
      return
    }

    entries.push({
      path: current.path,
      head: current.head ?? null,
      branch: current.branch ?? null,
      bare: Boolean(current.bare),
      detached: Boolean(current.detached),
      locked: Boolean(current.locked),
      prunable: Boolean(current.prunable)
    })
    current = {}
  }

  for (const line of lines) {
    if (!line.trim()) {
      pushCurrent()
      continue
    }

    if (line.startsWith('worktree ')) {
      pushCurrent()
      current = { path: line.slice('worktree '.length).trim() }
      continue
    }

    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim()
      continue
    }

    if (line.startsWith('branch ')) {
      current.branch = line.slice('branch refs/heads/'.length).trim()
      continue
    }

    if (line === 'bare') {
      current.bare = true
      continue
    }

    if (line === 'detached') {
      current.detached = true
      continue
    }

    if (line === 'locked') {
      current.locked = true
      continue
    }

    if (line === 'prunable') {
      current.prunable = true
    }
  }

  pushCurrent()
  return entries as WorktreeInfo[]
}

export function parseGitStatusSummary(output: string): GitStatusSummary {
  const files = uniqueStrings(
    output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
  )

  return {
    changedFilesCount: files.length,
    isDirty: files.length > 0,
    files
  }
}

export function deriveWorktreeName(branch: string, sessionId: string): string {
  const branchSuffix = branch.startsWith(WORKSPACE_SESSION_BRANCH_PREFIX)
    ? branch.slice(WORKSPACE_SESSION_BRANCH_PREFIX.length)
    : branch

  const compactSessionId = sanitizeWorkspaceBranchSegment(sessionId).slice(0, 8)
  return `${sanitizeWorkspaceBranchSegment(branchSuffix)}-${compactSessionId}`
}

export class GitService {
  private repoContextPromise: Promise<GitRepoContext> | null = null

  constructor(private readonly options: GitServiceOptions = {}) {}

  async resolveRepoContext(startPath?: string): Promise<GitRepoContext> {
    if (!startPath && this.repoContextPromise) {
      return this.repoContextPromise
    }

    const task = this.resolveRepoContextInternal(startPath)
    if (!startPath) {
      this.repoContextPromise = task
    }

    return task
  }

  async createWorktree(input: GitSessionInput): Promise<CreatedWorktree> {
    const repoContext = await this.resolveRepoContext()
    const branch = await this.resolveBranchName(
      repoContext.repoRoot,
      input.branchSlug ?? input.title,
      input.sessionId
    )
    const worktreeName = deriveWorktreeName(branch, input.sessionId)
    const worktreeContainer = join(
      dirname(repoContext.repoRoot),
      WORKTREE_CONTAINER_DIRNAME,
      sanitizeWorkspaceBranchSegment(basename(repoContext.repoRoot))
    )
    const worktreePath = join(worktreeContainer, worktreeName)

    await mkdir(worktreeContainer, { recursive: true })
    await this.runGit(
      ['worktree', 'add', '-b', branch, worktreePath, input.baseRef?.trim() || repoContext.baseRef],
      repoContext.repoRoot
    )
    await bootstrapWorktreeNodeModules(repoContext.repoRoot, worktreePath)

    return {
      repoRoot: repoContext.repoRoot,
      baseRef: input.baseRef?.trim() || repoContext.baseRef,
      branch,
      worktreeName,
      worktreePath
    }
  }

  async listWorktrees(repoRoot?: string): Promise<WorktreeInfo[]> {
    const context = repoRoot ? { repoRoot } : await this.resolveRepoContext()
    const result = await this.runGit(['worktree', 'list', '--porcelain'], context.repoRoot)
    return parseWorktreeListOutput(result.stdout)
  }

  async removeWorktree(worktreePath: string): Promise<void> {
    const repoContext = await this.resolveRepoContext()
    await this.runGit(['worktree', 'remove', worktreePath], repoContext.repoRoot)
  }

  async getStatus(cwd: string): Promise<GitStatusSummary> {
    const result = await this.runGit(['status', '--porcelain=v1', '--untracked-files=all'], cwd)
    return parseGitStatusSummary(result.stdout)
  }

  async getDiffStat(cwd: string): Promise<string> {
    const result = await this.runGit(['diff', '--stat', '--no-ext-diff'], cwd)
    return trimCommandOutput(result.stdout)
  }

  async createCommit(cwd: string, message: string): Promise<void> {
    await this.runGit(['commit', '-m', message], cwd)
  }

  async createPullRequest(cwd: string, args: readonly string[] = []): Promise<string> {
    const result = await this.runCommand('gh', ['pr', 'create', ...args], cwd)
    return trimCommandOutput(result.stdout)
  }

  private async resolveRepoContextInternal(startPath?: string): Promise<GitRepoContext> {
    const candidatePath =
      startPath?.trim() || this.options.repoRootOverride?.trim() || process.cwd()
    const repoRootResult = await this.runGit(['rev-parse', '--show-toplevel'], candidatePath)
    const repoRoot = trimCommandOutput(repoRootResult.stdout)
    const currentBranchResult = await this.runGitAllowFailure(
      ['branch', '--show-current'],
      repoRoot
    )
    const currentBranch = trimCommandOutput(currentBranchResult.stdout) || null
    const baseRef =
      currentBranch ||
      (await this.resolveDefaultBranch(repoRoot)) ||
      trimCommandOutput((await this.runGit(['rev-parse', 'HEAD'], repoRoot)).stdout)

    return {
      repoRoot,
      baseRef,
      currentBranch
    }
  }

  private async resolveDefaultBranch(repoRoot: string): Promise<string | null> {
    const originHead = await this.runGitAllowFailure(
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      repoRoot
    )
    const remoteBranch = trimCommandOutput(originHead.stdout).replace(/^origin\//, '')
    if (remoteBranch) {
      return remoteBranch
    }

    for (const branch of ['main', 'master']) {
      const exists = await this.runGitAllowFailure(
        ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
        repoRoot
      )
      if (exists.exitCode === 0) {
        return branch
      }
    }

    return null
  }

  private async resolveBranchName(
    repoRoot: string,
    branchSlug: string,
    sessionId: string
  ): Promise<string> {
    const normalized = normalizeWorkspaceBranchSlug(branchSlug)
    const candidates = [
      normalized,
      `${normalized}-${sanitizeWorkspaceBranchSegment(sessionId).slice(0, 8)}`
    ]

    for (const candidate of candidates) {
      if (!(await this.branchExists(repoRoot, candidate))) {
        return candidate
      }
    }

    let attempt = 1
    let candidate = `${candidates.at(-1)}-${String(attempt)}`
    while (await this.branchExists(repoRoot, candidate)) {
      attempt += 1
      candidate = `${candidates.at(-1)}-${String(attempt)}`
    }

    return candidate
  }

  private async branchExists(repoRoot: string, branch: string): Promise<boolean> {
    const result = await this.runGitAllowFailure(
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      repoRoot
    )
    if (result.exitCode === 0) {
      return true
    }

    const remoteResult = await this.runGitAllowFailure(
      ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
      repoRoot
    )
    return remoteResult.exitCode === 0
  }

  private async runGit(args: readonly string[], cwd: string): Promise<CommandResult> {
    return this.runCommand('git', args, cwd)
  }

  private async runCommand(
    command: string,
    args: readonly string[],
    cwd: string
  ): Promise<CommandResult> {
    try {
      const result = await execFileAsync(command, [...args], {
        cwd,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024
      })

      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${command} ${args.join(' ')} failed in ${cwd}: ${message}`)
    }
  }

  private async runGitAllowFailure(
    args: readonly string[],
    cwd: string
  ): Promise<CommandResult & { exitCode: number }> {
    try {
      const result = await this.runGit(args, cwd)
      return {
        ...result,
        exitCode: 0
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        stdout: '',
        stderr: message,
        exitCode: 1
      }
    }
  }
}

export function createGitService(options: GitServiceOptions = {}): GitService {
  return new GitService(options)
}
