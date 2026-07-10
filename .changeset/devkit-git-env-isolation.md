---
'@xnetjs/devkit': patch
---

Isolate git subprocesses from inherited repo-location env. When the dev loop (or
its tests) ran while a git hook was active — e.g. husky `pre-push` running
`pnpm test` — the hook's exported `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`
leaked into `git` children and overrode the explicit `cwd`, so operations
(`config`, `commit`, even `push`) targeted the hook's repo instead of the
requested worktree. `NodeCommandRunner` now scrubs git's repo-location env vars
for `git` invocations so `cwd` is always authoritative; an explicit
`options.env` entry still wins.
