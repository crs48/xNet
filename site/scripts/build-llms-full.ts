/**
 * Build script to generate llms-full.txt from all documentation pages.
 * This concatenates all MDX files into a single file for AI agents.
 *
 * Run with: npx tsx scripts/build-llms-full.ts
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, relative } from 'path'

interface DocPage {
  path: string
  title: string
  content: string
  order: number
}

// Define the order of sections
const SECTION_ORDER = [
  'introduction',
  'quickstart',
  'core-concepts',
  'hooks/overview',
  'hooks/usequery',
  'hooks/usemutate',
  'hooks/usenode',
  'hooks/useidentity',
  'hooks/patterns',
  'schemas/overview',
  'schemas/defineschema',
  'schemas/property-types',
  'schemas/relations',
  'schemas/type-inference',
  'guides/sync',
  'guides/offline',
  'guides/identity',
  'guides/collaboration',
  'guides/plugins',
  'guides/canvas',
  'guides/editor',
  'guides/hub',
  'guides/devtools',
  'guides/electron',
  'guides/testing',
  'concepts/local-first',
  'concepts/crdts',
  'concepts/sync-architecture',
  'concepts/identity-model',
  'concepts/cryptography',
  'concepts/data-model',
  'concepts/network',
  'architecture/overview',
  'architecture/decisions',
  'architecture/package-graph',
  'contributing/getting-started',
  'contributing/code-style',
  'contributing/testing'
]

async function collectMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
        files.push(fullPath)
      }
    }
  }

  await walk(dir)
  return files
}

function extractFrontmatter(content: string): {
  title: string
  description?: string
  body: string
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

  if (!frontmatterMatch) {
    return { title: 'Untitled', body: content }
  }

  const frontmatter = frontmatterMatch[1]
  const body = frontmatterMatch[2]

  // Extract title
  const titleMatch = frontmatter.match(/title:\s*['"]?([^'"\n]+)['"]?/)
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled'

  // Extract description
  const descMatch = frontmatter.match(/description:\s*['"]?([^'"\n]+)['"]?/)
  const description = descMatch ? descMatch[1].trim() : undefined

  return { title, description, body }
}

function cleanMdxContent(content: string): string {
  // Remove import statements
  content = content.replace(/^import\s+.*$/gm, '')

  // Remove JSX components but keep their text content
  // Handle components like <Aside> or :::note
  content = content.replace(/:::(note|tip|caution|danger)\[([^\]]*)\]/g, '**$2**')
  content = content.replace(/:::/g, '')

  // Remove component tags but keep content
  content = content.replace(/<[A-Z][a-zA-Z]*[^>]*>/g, '')
  content = content.replace(/<\/[A-Z][a-zA-Z]*>/g, '')

  // Clean up extra whitespace
  content = content.replace(/\n{3,}/g, '\n\n')

  return content.trim()
}

function getOrderIndex(filePath: string, docsDir: string): number {
  const relativePath = relative(join(docsDir, 'docs'), filePath)
    .replace(/\.mdx$/, '')
    .replace(/\\/g, '/')

  const index = SECTION_ORDER.indexOf(relativePath)
  return index >= 0 ? index : 999
}

async function buildLlmsFull() {
  const docsDir = join(process.cwd(), 'src/content/docs')
  const outputPath = join(process.cwd(), 'public/llms-full.txt')

  console.log('Collecting MDX files from:', docsDir)

  const files = await collectMdxFiles(join(docsDir, 'docs'))
  console.log(`Found ${files.length} MDX files`)

  const pages: DocPage[] = []

  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    const { title, body } = extractFrontmatter(content)
    const cleanedBody = cleanMdxContent(body)
    const order = getOrderIndex(file, docsDir)

    pages.push({
      path: file,
      title,
      content: cleanedBody,
      order
    })
  }

  // Sort by order
  pages.sort((a, b) => a.order - b.order)

  // Build output
  let output = `# xNet Documentation

> Complete documentation for xNet, a local-first framework for building multiplayer React applications. Data lives on the device, syncs peer-to-peer via CRDTs, and works offline. No backend required.

## Important: xNet is NOT a Client-Server Architecture

Before reading this documentation, understand that xNet works differently:

- **No backend needed**: Data lives on the device, not a server
- **No API endpoints**: Use React hooks (useQuery, useMutate) instead of fetch/axios
- **No auth flows**: Identity is cryptographic (DID:key) and built-in
- **No state management**: Hooks are reactive and handle this automatically
- **Offline by default**: Everything works offline, syncs when online

## Table of Contents

`

  // Add table of contents
  for (const page of pages) {
    const indent =
      page.path.includes('/concepts/') ||
      page.path.includes('/guides/') ||
      page.path.includes('/hooks/') ||
      page.path.includes('/schemas/') ||
      page.path.includes('/architecture/') ||
      page.path.includes('/contributing/')
        ? '  '
        : ''
    output += `${indent}- ${page.title}\n`
  }

  output += '\n---\n\n'

  // Add each page
  for (const page of pages) {
    output += `## ${page.title}\n\n`
    output += page.content
    output += '\n\n---\n\n'
  }

  // Write output
  await writeFile(outputPath, output)

  const stats = await stat(outputPath)
  const sizeKB = Math.round(stats.size / 1024)

  console.log(`Generated llms-full.txt (${sizeKB} KB, ${output.length} bytes)`)
  console.log(`Output: ${outputPath}`)
}

buildLlmsFull().catch((err) => {
  console.error('Error building llms-full.txt:', err)
  process.exit(1)
})
