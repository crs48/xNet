# graphify reference: commit hook and native CLAUDE.md integration

Load this when the user asked to install the commit hook or wire graphify into a project's CLAUDE.md.

## For git commit hook

Install a pre-commit hook that refreshes and stages graph artifacts before the commit is created. This keeps `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, and `graphify-out/graph.html` in the same commit as the source changes that affected them.

```bash
graphify hook install    # install
graphify hook uninstall  # remove
graphify hook status     # check
```

Before every `git commit`, the hook detects staged non-graph files, refuses partially staged files whose working-tree contents differ from the staged snapshot, re-runs AST extraction for the changed files, regenerates the aggregated HTML view, and stages the refreshed graph artifacts. Semantic doc/image extraction is not done in the hook - run `/graphify --update` manually for those.

If a pre-commit hook already exists, graphify should insert this refresh before quality gates so graph artifacts are formatted and committed together with the triggering changes.

---

## For native CLAUDE.md integration

Run once per project to make graphify always-on in Claude Code sessions:

```bash
graphify claude install
```

This writes a `## graphify` section to the local `CLAUDE.md` that instructs Claude to check the graph before answering codebase questions and rebuild it after code changes. No manual `/graphify` needed in future sessions.

```bash
graphify claude uninstall  # remove the section
```
