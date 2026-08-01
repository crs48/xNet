#!/usr/bin/env node
/**
 * Guard visual exploration companions (exploration 0403).
 *
 * An MDX companion beside a markdown exploration is a second file describing the
 * same work — exactly the two-source drift that put the brand-spelling rule in
 * both CLAUDE.md and AGENTS.md in two different wordings. Prose discipline alone
 * does not survive; this makes the mechanical half decidable (0294: a gate needs
 * a named consumer and a pass condition it can actually meet).
 *
 * Three checks:
 *
 *   1. PAIRING (fatal, both directions) — every `visuals/NNNN/` has a matching
 *      `NNNN_[?]_*.md`, and that `.md` links to it. An orphan companion rots
 *      unread; an unlinked one is invisible to anyone reading the exploration.
 *
 *   2. HOST THEME CLASSES (fatal) — a wireframe must not carry Tailwind palette
 *      or shadow classes. They leak the host app's CSS into the mockup and make
 *      dark-mode frames unreadable. This is the wireframe-local twin of
 *      check-surface-tokens.mjs (0299).
 *
 *   3. HARD-CODED COLOUR (fatal) — no hex literals or `font-family` in a
 *      companion. `--wf-*` tokens alias the real ramp, which is the only reason
 *      a sketch is correct in light, dark and true-black.
 *
 * Named consumer: `/explore --visual` and the `visual-exploration` skill.
 *
 * Run: `node scripts/check-visual-explorations.mjs` (or
 * `pnpm check:visual-explorations`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const EXPLORATIONS = join(root, 'docs/explorations')
const VISUALS = join(EXPLORATIONS, 'visuals')

/** Tailwind palette / shadow utilities that leak host CSS into a mockup. */
const HOST_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|placeholder|decoration)-(?:white|black|slate|zinc|gray|grey|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b|\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/

/** Hex literals and font-family declarations — both belong to the renderer. */
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/
const FONT_FAMILY = /font-family\s*:/
/* eslint-disable-next-line no-useless-escape */
const FONT_FAMILY_JSX = /fontFamily\s*:/

let violations = 0

function fail(file, line, message, fix) {
  violations++
  console.error(`✗ ${relative(root, file)}${line ? `:${line}` : ''}  ${message}`)
  if (fix) console.error(`    → ${fix}`)
}

if (!existsSync(VISUALS)) {
  console.log('✓ no visual explorations yet (docs/explorations/visuals absent)')
  process.exit(0)
}

const explorationFiles = readdirSync(EXPLORATIONS).filter((f) => /^\d{4}_\[.\]_.*\.md$/.test(f))
const byNumber = new Map(explorationFiles.map((f) => [f.slice(0, 4), f]))

const companionDirs = readdirSync(VISUALS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

for (const dir of companionDirs) {
  const dirPath = join(VISUALS, dir)

  if (!/^\d{4}$/.test(dir)) {
    fail(dirPath, 0, `"${dir}" is not a 4-digit exploration number`, 'rename to e.g. visuals/0403/')
    continue
  }

  // 1. PAIRING — the companion needs a parent, and the parent must link back.
  const parent = byNumber.get(dir)
  if (!parent) {
    fail(dirPath, 0, `no exploration ${dir}_[?]_*.md`, 'delete the companion, or add the doc')
    continue
  }

  const parentPath = join(EXPLORATIONS, parent)
  const parentText = readFileSync(parentPath, 'utf8')
  if (!parentText.includes(`visuals/${dir}`)) {
    fail(
      parentPath,
      0,
      `does not link its companion visuals/${dir}/`,
      `link visuals/${dir}/exploration.mdx`
    )
  }

  // 2 + 3. Content rules, per companion file.
  const mdxFiles = readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mdx'))
    .map((e) => join(dirPath, e.name))

  if (mdxFiles.length === 0) {
    fail(dirPath, 0, 'contains no .mdx file', 'add exploration.mdx, or delete the directory')
    continue
  }

  for (const file of mdxFiles) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (HOST_CLASS.test(line)) {
          fail(file, i + 1, 'host theme class in a companion', 'use --wf-* tokens or .wf-* helpers')
        }
        if (HEX.test(line)) {
          fail(
            file,
            i + 1,
            'hard-coded hex colour',
            'use a --wf-* token so both themes stay correct'
          )
        }
        if (FONT_FAMILY.test(line) || FONT_FAMILY_JSX.test(line)) {
          fail(file, i + 1, 'font-family in a companion', 'the renderer owns typography')
        }
      })
  }
}

// The other direction: an exploration that links a companion that isn't there.
for (const [number, file] of byNumber) {
  const text = readFileSync(join(EXPLORATIONS, file), 'utf8')
  if (text.includes(`visuals/${number}/`) && !companionDirs.includes(number)) {
    fail(
      join(EXPLORATIONS, file),
      0,
      `links visuals/${number}/ but the directory is missing`,
      'create the companion, or remove the link'
    )
  }
}

if (violations > 0) {
  console.error(
    `\n${violations} visual-exploration violation(s). See .claude/skills/visual-exploration/references/wireframe.md.`
  )
  process.exit(1)
}
console.log(`✓ visual explorations OK (${companionDirs.length} companion(s) checked)`)
process.exit(0)
