<!-- Keep the structure; delete any guidance comments before opening. -->

## What

<!-- What changed and why. Link the exploration doc if one drove this. -->

## Changelog

<!--
One user-facing entry. On merge, CI turns this into a changelog entry on the
site (and stamps the date, PR number, and author automatically — exploration
0197). For internal-only PRs, leave this empty and add the `skip-changelog`
label. Format:
  First line = headline.
  Then a sentence of benefit-focused prose (what the user can now do).
  Then `- ` bullets for specific user-visible points (optional).
  Then `tags: app, ai` (from: app, crm, finance, tasks, ai, plugins, editor,
  sync, identity, platform, performance, devtools, ci).
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
