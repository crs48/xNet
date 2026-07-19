# @xnetjs/devkit

The **agentic dev-loop core** — the verifiable spine of "vibe coding xNet from
within xNet" ([exploration 0190](../../docs/explorations/0190_%5B_%5D_IN_APP_AGENTIC_VIBE_CODING_AND_SELF_MODIFICATION.md)).

> **Alpha software.** xNet is released but early: this package is on npm and
> usable today, but its API can change between releases, sometimes without a
> migration path. Pin your version. See the
> [project README](https://github.com/crs48/xNet#readme) for what alpha means here.

It productizes the loop this very repo's contributors (human and agent) run on
every change:

```
isolate (git worktree) → agent edits → validation gate → checkpoint | roll back
```

- **Isolation** — every task runs in a throwaway `git worktree`; the live
  checkout is never touched (the Claude Code pattern).
- **Time travel** — a `checkpoint` is a commit you can `restore` to (the Replit
  "App History" model); a failed gate hard-resets, so you always land on a
  known-good state.
- **Bring your own agent** — `cliAgentRunner` spawns the user's _own_
  `claude`/`codex`/`aider` CLI (zero model cost to xNet); `fakeAgentRunner` is for
  tests.
- **Injectable everything** — all shell access goes through one `CommandRunner`
  port (`NodeCommandRunner` spawns; `FakeCommandRunner` scripts), so the whole
  loop is unit-testable without spawning anything.

**Zero runtime dependencies** (`node:child_process` only). Node-targeted (Electron
main / the CLI); the browser/WebContainers tier supplies its own `CommandRunner`.

## Usage

```ts
import {
  Git,
  NodeCommandRunner,
  cliAgentRunner,
  defaultXnetGate,
  runAgentTask,
  openPullRequest
} from '@xnetjs/devkit'

const runner = new NodeCommandRunner()
const git = new Git(runner, '/path/to/repo')
const agent = cliAgentRunner(runner, { command: 'claude' }) // the user's subscription

const result = await runAgentTask({
  git,
  runner,
  agent,
  task: { id: 'XN-142', prompt: 'Fix the off-by-one in the importer' },
  worktreePath: '/tmp/xnet-XN-142',
  gate: defaultXnetGate({ changedSince: 'origin/main' }), // typecheck → lint → test → fallow
  keepWorktree: true
})

if (result.ok) {
  // a checkpoint commit is on result.branch; one-click PR:
  const { url } = await openPullRequest(runner, result.worktreePath, result.branch, {
    title: 'fix: importer off-by-one'
  })
} else if (result.rolledBack) {
  // the gate failed at result.gate.failedStep; the worktree was reset — nothing broke.
}
```

## What this is / isn't

This is the **pure orchestration spine** — including the **bridge daemon's logic**
(`bridgeHealth` for the `:31416` health probe the connector ladder detects, and
`handleBridgeRun` for `/run`) and both **output paths** (`openPullRequest` to the
open-source repo, `publishPluginRepo` to a new plugin repo). What lives outside
this package is the thin host wiring: the Electron HTTP server around the bridge
handlers, the AI terminal UI, the WebContainers (web) and remote-sandbox
(mobile/managed) tiers, and the Projects/Tasks board — the later phases of
exploration 0190. Running the _result_ (an AI-authored plugin) safely is the
job of `@xnetjs/labs` (the sandbox runtime ladder + trust tiers) and the 0189
capability model — not this package.

**Security note:** the local CLI tier runs the user's own agent with their OS
privileges; a worktree isolates the _repo_, not the _OS_. The genuinely sandboxed
tiers (WebContainers / remote microVM / running plugins through the labs ladder)
are where "can't delete your data" holds.
