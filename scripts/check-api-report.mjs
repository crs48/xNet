#!/usr/bin/env node
/**
 * API report drift gate (exploration 0370).
 *
 * The committed `packages/*​/etc/*.api.md` reports are the record of what xNet
 * promises to keep working (see STABILITY.md). This fails CI when the built
 * surface no longer matches the committed report, so a change to what we export
 * has to land as a reviewable diff.
 *
 * WHY NOT just `api-extractor run`: without `--local` it reports a changed
 * signature as a *warning* and still exits 0 — a gate that can never fail is
 * worse than no gate (CLAUDE.md §0294). So we run WITH `--local`, which
 * rewrites the report, and then let `git diff --exit-code` be the real
 * assertion. Same mechanism rushstack uses.
 *
 * Local fix when this fails: `pnpm --filter <pkg> api:update`, review the diff,
 * commit it. A diff here is not automatically wrong — it means the public
 * surface moved, and someone should agree that it should have.
 */
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = ['react', 'core', 'data', 'sync']

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts })
}

let failed = false

for (const pkg of PACKAGES) {
  try {
    run('pnpm', ['--filter', `@xnetjs/${pkg}`, 'api:update'])
  } catch (err) {
    process.stderr.write(
      `\n✗ api-extractor failed for @xnetjs/${pkg}:\n${err.stdout ?? ''}${err.stderr ?? ''}\n`
    )
    failed = true
  }
}

// The reports are regenerated above; any diff means the surface moved.
// NOTE: `git diff` alone is not enough — it ignores UNTRACKED files, so a brand
// new report (or a package whose report was never committed) would slip through
// silently. `git status --porcelain` covers both cases.
const diff = execSync('git status --porcelain -- packages/*/etc/', {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .map((l) => l.slice(3).trim())
  .filter(Boolean)

if (diff.length > 0) {
  process.stderr.write(
    `\n✗ Public API surface changed without an updated report:\n` +
      diff.map((f) => `    ${f}\n`).join('') +
      `\nThis is the record of what we promise to keep working (STABILITY.md).\n` +
      `If the change is intended: run \`pnpm --filter <pkg> api:update\`, review the\n` +
      `diff, and commit the updated report — a reviewer signs off via CODEOWNERS.\n` +
      `If it is not intended, you have an accidental export.\n\n` +
      execSync("git diff --stat -- packages/*/etc/", { cwd: ROOT, encoding: "utf8" })
  )
  failed = true
}

if (failed) process.exit(1)
process.stdout.write('✓ API reports match the built surface\n')
