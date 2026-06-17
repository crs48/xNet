#!/usr/bin/env node
/**
 * PR gate (exploration 0197): fail unless the PR body has a `## Changelog`
 * section with real content, or the PR carries the `skip-changelog` label.
 * Wired as a required check (changelog-section) so a PR can't merge without
 * either. Uses the same parsing as the on-merge writer (from-pr.mjs) via lib.mjs.
 */
import { hasChangelogContent } from './lib.mjs'

const body = process.env.PR_BODY || ''
const labels = (process.env.PR_LABELS || '')
  .split(',')
  .map((l) => l.trim())
  .filter(Boolean)

if (labels.includes('skip-changelog')) {
  console.log('✓ skip-changelog label present — changelog not required for this PR.')
  process.exit(0)
}

if (hasChangelogContent(body)) {
  console.log('✓ This PR has a Changelog section.')
  process.exit(0)
}

console.error(
  [
    '✗ This PR is missing a "## Changelog" section.',
    '',
    'Add one to the PR description so the change reaches the public changelog',
    '(CI turns it into an entry automatically on merge):',
    '',
    '  ## Changelog',
    '',
    '  Short, benefit-first headline',
    '  One sentence on what the user can now do.',
    '  - A specific user-visible point',
    '  tags: app, ai',
    '',
    'If this PR has no user-facing impact (internal refactor, chore, CI),',
    'add the "skip-changelog" label instead.'
  ].join('\n')
)
process.exit(1)
