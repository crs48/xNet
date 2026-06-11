/**
 * TaskGithubBadges - compact PR / review / CI indicators for task rows and
 * cards, mirrored live from linked GitHub references
 * (githubStateFromReferences).
 */
import type { TaskGithubState } from './types'
import { CheckCircle2, CircleDot, GitMerge, GitPullRequest, XCircle } from 'lucide-react'
import { cn } from '../../utils'

export interface TaskGithubBadgesProps {
  github?: TaskGithubState
  className?: string
}

const PR_STATE_META: Record<
  NonNullable<TaskGithubState['prState']>,
  { label: string; colorClass: string; merged?: boolean }
> = {
  open: { label: 'PR open', colorClass: 'text-success' },
  draft: { label: 'Draft PR', colorClass: 'text-foreground-muted' },
  merged: { label: 'PR merged', colorClass: 'text-info', merged: true },
  closed: { label: 'PR closed', colorClass: 'text-destructive' }
}

export function TaskGithubBadges({ github, className }: TaskGithubBadgesProps) {
  if (!github || (!github.prState && !github.reviewState && !github.ciState)) {
    return null
  }

  const prMeta = github.prState ? PR_STATE_META[github.prState] : null

  return (
    <span
      data-testid="task-github-badges"
      className={cn('inline-flex shrink-0 items-center gap-1', className)}
    >
      {prMeta &&
        (prMeta.merged ? (
          <GitMerge
            className={cn('h-3.5 w-3.5', prMeta.colorClass)}
            aria-label={prMeta.label}
            role="img"
          />
        ) : (
          <GitPullRequest
            className={cn('h-3.5 w-3.5', prMeta.colorClass)}
            aria-label={prMeta.label}
            role="img"
          />
        ))}
      {github.reviewState === 'approved' && (
        <CheckCircle2
          className="h-3.5 w-3.5 text-success"
          aria-label="Review approved"
          role="img"
        />
      )}
      {github.reviewState === 'changes-requested' && (
        <XCircle className="h-3.5 w-3.5 text-warning" aria-label="Changes requested" role="img" />
      )}
      {github.ciState === 'passing' && (
        <CheckCircle2 className="h-3 w-3 text-success" aria-label="Checks passing" role="img" />
      )}
      {github.ciState === 'failing' && (
        <XCircle className="h-3 w-3 text-destructive" aria-label="Checks failing" role="img" />
      )}
      {github.ciState === 'pending' && (
        <CircleDot className="h-3 w-3 text-warning" aria-label="Checks pending" role="img" />
      )}
    </span>
  )
}
