#!/usr/bin/env node
/**
 * Guard the agent instruction tree (exploration 0405).
 *
 * The tree only works if it stays single-sourced, and prose discipline does not
 * survive contact with a busy repo — the brand-spelling rule was once written
 * out twice in two wordings, with one copy already deferring to the other.
 * Every assertion below is mechanical and decidable (0294: a gate needs a named
 * consumer and a pass condition it can actually meet).
 *
 * Named consumer: every agent that loads these files — Claude Code via
 * CLAUDE.md, Codex/Copilot via AGENTS.md and .agents/skills.
 *
 * Six assertions:
 *
 *   1. SINGLE SOURCE — every CLAUDE.md is a symlink, or its first non-blank
 *      line is `@AGENTS.md`. Content above the import is a second source of
 *      truth by definition.
 *   2. ROOT SIZE — every AGENTS.md stays under the documented 200-line
 *      adherence threshold.
 *   3. PAIRING — every AGENTS.md has a sibling CLAUDE.md, so Claude Code sees
 *      what Codex sees.
 *   4. RULES ARE SCOPED — every .claude/rules/*.md carries `paths:`. Without
 *      it a rule loads every session, which is the cost this tree removes.
 *   5. SKILLS INDEX — the table in the root AGENTS.md lists exactly the
 *      directories in .claude/skills/. An index that rots is worse than none.
 *   6. SYMLINK — .agents/skills resolves to .claude/skills, so Codex and
 *      Copilot see the same skills.
 *
 * Run: `node scripts/check-agent-docs.mjs` (or `pnpm check:agent-docs`).
 */
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const MAX_LINES = 200
const SKILLS_DIR = join(root, '.claude/skills')
const RULES_DIR = join(root, '.claude/rules')
const AGENTS_LINK = join(root, '.agents/skills')

let violations = 0

function fail(file, message, fix) {
  violations++
  console.error(`✗ ${relative(root, file) || '.'}  ${message}`)
  if (fix) console.error(`    → ${fix}`)
}

/** Walk for AGENTS.md / CLAUDE.md, skipping vendored and generated trees. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'storybook-static', '.claude'])

function findInstructionFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.agents') {
      if (entry.name !== '.claude') continue
    }
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      findInstructionFiles(full, found)
    } else if (entry.name === 'AGENTS.md' || entry.name === 'CLAUDE.md') {
      found.push(full)
    }
  }

  return found
}

const files = findInstructionFiles(root)
const agentsFiles = files.filter((f) => f.endsWith('AGENTS.md'))
const claudeFiles = files.filter((f) => f.endsWith('CLAUDE.md'))

// 1 + 2 + 3
for (const file of claudeFiles) {
  const isSymlink = lstatSync(file).isSymbolicLink()
  if (!isSymlink) {
    const firstLine = readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0)
    if (firstLine !== '@AGENTS.md') {
      fail(
        file,
        `first non-blank line is ${JSON.stringify(firstLine ?? '')}, not "@AGENTS.md"`,
        'a CLAUDE.md imports AGENTS.md; content above the import is a second source of truth'
      )
    }
  }
  const sibling = join(file, '..', 'AGENTS.md')
  if (!existsSync(sibling)) {
    fail(file, 'has no sibling AGENTS.md to import', 'add AGENTS.md, or remove this CLAUDE.md')
  }
}

for (const file of agentsFiles) {
  const lines = readFileSync(file, 'utf8').split('\n').length
  if (lines > MAX_LINES) {
    fail(
      file,
      `${lines} lines — over the ${MAX_LINES}-line adherence threshold`,
      'push surface-specific content into a nested AGENTS.md, or a skill'
    )
  }
  const sibling = join(file, '..', 'CLAUDE.md')
  if (!existsSync(sibling)) {
    fail(
      file,
      'has no sibling CLAUDE.md',
      'add a CLAUDE.md containing "@AGENTS.md" so Claude Code sees it too'
    )
  }
}

// 4
if (existsSync(RULES_DIR)) {
  for (const entry of readdirSync(RULES_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const file = join(RULES_DIR, entry.name)
    const text = readFileSync(file, 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
    if (!/^paths:/m.test(frontmatter)) {
      fail(
        file,
        'no `paths:` frontmatter',
        'a rule without paths loads every session — scope it, or move it into AGENTS.md'
      )
    }
  }
}

// 5
const rootAgents = join(root, 'AGENTS.md')
if (existsSync(rootAgents) && existsSync(SKILLS_DIR)) {
  const onDisk = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort()
  const text = readFileSync(rootAgents, 'utf8')
  const indexed = [...text.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1])
  const missing = onDisk.filter((name) => !indexed.includes(name))
  const stale = indexed.filter((name) => !onDisk.includes(name))
  for (const name of missing) {
    fail(rootAgents, `skills index is missing "${name}"`, 'add a row to the Skills table')
  }
  for (const name of stale) {
    fail(rootAgents, `skills index lists "${name}", which has no SKILL.md`, 'remove the row')
  }
}

// 6
if (!existsSync(AGENTS_LINK)) {
  fail(AGENTS_LINK, 'missing', 'ln -s ../.claude/skills .agents/skills')
} else if (!lstatSync(AGENTS_LINK).isSymbolicLink()) {
  fail(
    AGENTS_LINK,
    'is not a symlink (a Windows checkout without symlink support does this)',
    'ln -s ../.claude/skills .agents/skills'
  )
} else if (readlinkSync(AGENTS_LINK) !== '../.claude/skills') {
  fail(AGENTS_LINK, `points at ${readlinkSync(AGENTS_LINK)}`, 'it must point at ../.claude/skills')
}

if (violations > 0) {
  console.error(
    `\n${violations} agent-docs violation(s). See .claude/skills/writing-agent-instructions/SKILL.md.`
  )
  process.exit(1)
}
const skillCount = existsSync(SKILLS_DIR)
  ? readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, 'SKILL.md'))
    ).length
  : 0
console.log(
  `✓ agent docs OK (${agentsFiles.length} AGENTS.md, ${claudeFiles.length} CLAUDE.md, ` +
    `${skillCount} skills)`
)
process.exit(0)
