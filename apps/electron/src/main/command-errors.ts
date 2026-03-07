/**
 * Shared command-failure formatting for Electron workspace services.
 */

const COMMAND_RECOVERY_HINTS: Record<string, string> = {
  git: 'Install Git and ensure `git` is available on PATH before using the coding workspace shell.',
  gh: 'Install GitHub CLI (`gh`) and run `gh auth login` before creating pull requests from the workspace shell.',
  pnpm: 'Install pnpm and run `pnpm install` in this repository before starting worktree previews.'
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : null
}

export function formatCommandFailure(
  command: string,
  args: readonly string[],
  cwd: string,
  error: unknown
): string {
  const errorCode = getErrorCode(error)
  const fallbackMessage = error instanceof Error ? error.message : String(error)
  const commandLabel = `${command} ${args.join(' ')}`.trim()
  const recovery = COMMAND_RECOVERY_HINTS[command]

  if (errorCode === 'ENOENT') {
    return recovery
      ? `${command} is required but was not found while running ${commandLabel} in ${cwd}. ${recovery}`
      : `${command} is required but was not found while running ${commandLabel} in ${cwd}.`
  }

  return recovery
    ? `${commandLabel} failed in ${cwd}: ${fallbackMessage}. ${recovery}`
    : `${commandLabel} failed in ${cwd}: ${fallbackMessage}`
}
