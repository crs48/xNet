---
'@xnetjs/devkit': patch
---

`NodeCommandRunner` now scrubs git repo-location env vars (`GIT_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_PREFIX`) from the
inherited environment before spawning subprocesses. Previously, running devkit
inside a git hook (where `git commit` exports `GIT_INDEX_FILE`) silently
redirected every spawned `git` at the hook's repository instead of the caller's
`cwd`, breaking temp-repo workflows and worktree creation with errors like
".git/index: index file open failed: Not a directory". An explicit value passed
via `options.env` still wins.
