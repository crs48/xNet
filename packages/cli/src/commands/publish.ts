/**
 * `xnet publish` — render a publication to a static site (exploration 0362).
 *
 * The BATNA command. It emits plain HTML, RSS and a sitemap into a directory
 * you can serve from anything — S3, Pages, nginx, a Raspberry Pi — with no hub
 * and no xNet runtime in the read path. As long as this works, self-hosting
 * remains a real, undegraded alternative to any managed publishing tier.
 */
import type { FeedMeta, SitePost } from '@xnetjs/publish'
import type { Command } from 'commander'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { buildStaticSite } from '@xnetjs/publish'
import chalk from 'chalk'

/**
 * The publication file format: metadata plus posts whose bodies are already
 * rendered HTML.
 *
 * Reading posts straight from a live workspace needs the store, which pulls in
 * a native SQLite build; keeping the CLI's input a plain JSON document means
 * `xnet publish` runs anywhere Node runs, and any producer (an export, a hub
 * dump, a script) can feed it.
 */
export type PublicationFile = {
  meta: FeedMeta
  posts: SitePost[]
  css?: string
  head?: { imageUrl?: string; twitterSite?: string }
}

/** Validate a publication file, throwing a message meant for a human. */
export function assertPublication(value: unknown): asserts value is PublicationFile {
  if (typeof value !== 'object' || value === null) {
    throw new Error('publication file must be a JSON object')
  }
  const file = value as Partial<PublicationFile>
  if (!file.meta || typeof file.meta.siteUrl !== 'string' || typeof file.meta.title !== 'string') {
    throw new Error('publication file needs `meta.siteUrl` and `meta.title`')
  }
  if (!Array.isArray(file.posts)) throw new Error('publication file needs a `posts` array')
  for (const [i, post] of file.posts.entries()) {
    if (typeof post?.slug !== 'string' || post.slug === '') {
      throw new Error(`posts[${i}] needs a non-empty \`slug\``)
    }
    if (typeof post.title !== 'string') throw new Error(`posts[${i}] needs a \`title\``)
    if (typeof post.html !== 'string') {
      throw new Error(`posts[${i}] needs rendered \`html\` (see renderPost() in @xnetjs/publish)`)
    }
  }
}

export function registerPublishCommand(program: Command): void {
  const publish = program
    .command('publish')
    .description('Render a publication to a static site (HTML, RSS, sitemap)')

  publish
    .command('static', { isDefault: true })
    .description('Write a self-contained static site to a directory')
    .requiredOption('--input <path>', 'Publication JSON (meta + posts with rendered html)')
    .option('--out <dir>', 'Output directory', 'dist/publish')
    .option('--dry-run', 'List the files that would be written without writing them')
    .action(async (opts: { input: string; out: string; dryRun?: boolean }) => {
      const inputPath = resolve(opts.input)
      const outDir = resolve(opts.out)

      let parsed: unknown
      try {
        parsed = JSON.parse(await readFile(inputPath, 'utf8'))
      } catch (error) {
        console.error(chalk.red(`Could not read ${inputPath}: ${(error as Error).message}`))
        process.exitCode = 1
        return
      }

      let file: PublicationFile
      try {
        assertPublication(parsed)
        file = parsed
      } catch (error) {
        console.error(chalk.red((error as Error).message))
        process.exitCode = 1
        return
      }

      const site = buildStaticSite({
        meta: file.meta,
        posts: file.posts,
        css: file.css,
        head: file.head
      })

      const published = file.posts.filter((p) => Boolean(p.publishedAt)).length
      const drafts = file.posts.length - published

      if (opts.dryRun) {
        for (const path of [...site.keys()].sort()) console.log(join(outDir, path))
        console.log(chalk.dim(`${site.size} file(s), not written (--dry-run)`))
        return
      }

      for (const [path, contents] of site) {
        const target = join(outDir, path)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, contents, 'utf8')
      }

      console.log(chalk.green(`Published ${published} post(s) to ${outDir}`))
      if (drafts > 0) {
        // Drafts are excluded by construction; say so rather than leaving the
        // author wondering where a post went.
        console.log(chalk.dim(`${drafts} draft(s) skipped (no publishedAt)`))
      }
      console.log(chalk.dim('Serve this directory from any static host — no hub required.'))
    })
}
