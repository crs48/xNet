/**
 * Recent console lines for a debug report (exploration 0315 P2).
 *
 * Reads the devtools provider's `ConsoleLogStore` ring (0275) if present.
 * Returns [] in production builds, where the store no-ops. The lines are
 * re-scrubbed at compose time by `composeDebugReport`, so this hook stays a
 * thin, devtools-coupled reader that the dialog itself doesn't depend on.
 */

import { useDevTools } from '@xnetjs/devtools'

interface LogEntryLike {
  level: string
  channel: string
  message: string
}

interface ConsoleLogStoreLike {
  getRecent: (n: number) => LogEntryLike[]
}

const BREADCRUMB_COUNT = 50

export function useReportBreadcrumbs(): string[] {
  const devtools = useDevTools() as { consoleLogs?: ConsoleLogStoreLike }
  const store = devtools.consoleLogs
  if (!store) return []
  return store.getRecent(BREADCRUMB_COUNT).map((e) => `${e.level} [${e.channel}] ${e.message}`)
}
