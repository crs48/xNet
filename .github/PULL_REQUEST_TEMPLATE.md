<!-- Keep the structure; delete any guidance comments before opening. -->

## What

<!-- What changed and why. Link the exploration doc if one drove this. -->

## Changelog

<!--
For a user-facing change, add a changelog fragment to this PR (the PR number is
filled in at deploy — exploration 0197):
  node scripts/changelog/new.mjs --title "Short, benefit-first headline" \
    --summary "One sentence on what the user can now do." \
    --tags app,ai --highlight "A specific user-visible point"
Commit the resulting site/src/data/changelog/<id>.json. For internal-only PRs,
add the `skip-changelog` label instead. The changelog-section check enforces this.
-->

## Verification

<!-- Tests run, browser checks, benchmarks, screenshots. -->

## Docs & site sync

<!--
If this PR changes a user-facing surface (app UI, hooks/API, CLI, hub,
schemas), the docs site (site/src/content/docs/) and/or landing page
(site/src/components/sections/, site/src/data/roadmap.ts) must move with it
in this same PR — that is how the site stays truthful (see exploration 0170).
-->

- [ ] Docs/landing updated for user-facing changes, **or** no user-facing
      surface changed. Impact: <!-- "none — internal refactor" or list pages -->
