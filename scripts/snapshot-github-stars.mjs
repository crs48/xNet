#!/usr/bin/env node
// Read the signed-in account's stars; never change GitHub state or replace an existing snapshot.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { link, mkdir, open, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: node scripts/snapshot-github-stars.mjs <new-output.json>\nRequires gh authentication. Saves currently accessible stars, including private repositories. All pages must finish; an existing file is never replaced.')
} else {
  if (args.length !== 1 || !args[0].endsWith('.json'))
    throw new Error('Provide a new JSON output path; use --help for details.')
  const path = resolve(args[0])
  const temporary = `${path}.incomplete-${randomUUID()}`
  const run = promisify(execFile)
  const api = async (parameters) => {
    const { stdout } = await run('gh', ['api', ...parameters], { maxBuffer: 128 * 1024 * 1024 })
    return JSON.parse(stdout)
  }
  const startedAt = new Date().toISOString()
  const user = await api(['user'])
  if (typeof user.login !== 'string' || !user.login) throw new Error('GitHub account is unavailable')
  const pages = await api([
    '--paginate', '--slurp',
    '-H', 'Accept: application/vnd.github.star+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '/user/starred?per_page=100&sort=created&direction=asc'
  ])
  if (!Array.isArray(pages) || !pages.every(Array.isArray))
    throw new Error('GitHub did not return paginated stars')
  const stars = pages.flat()
  if (stars.some((star) => !Number.isSafeInteger(star?.repo?.id) || !Number.isFinite(Date.parse(star?.starred_at))))
    throw new Error('GitHub returned incomplete repository or native timestamp data')
  const snapshot = {
    format: 'xnet-github-stars/1',
    account: user.login,
    startedAt,
    finishedAt: new Date().toISOString(),
    source: { endpoint: '/user/starred', mediaType: 'application/vnd.github.star+json', apiVersion: '2022-11-28' },
    coverage: {
      paginationCompleted: true,
      atomic: false,
      pages: pages.length,
      records: stars.length,
      uniqueRepositories: new Set(stars.map((star) => star.repo.id)).size,
      scope: 'repositories accessible to the authenticated account; currently starred only'
    },
    stars
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(snapshot, null, 2) + '\n')
      await file.sync()
    } finally { await file.close() }
    // An exclusive hard link makes partial output invisible and refuses accidental replacement.
    await link(temporary, path)
    const directory = await open(dirname(path), 'r')
    try { await directory.sync() } finally { await directory.close() }
    console.log(JSON.stringify({ path, account: user.login, ...snapshot.coverage }, null, 2))
  } finally { await rm(temporary, { force: true }) }
}
