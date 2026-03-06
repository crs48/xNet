/**
 * Smart reference provider registry.
 *
 * Parses supported URLs into structured inline references suitable for compact
 * task-friendly chips. This intentionally overlaps with block embeds, but keeps
 * enough structure to represent links intelligently without expanding them.
 */

import { detectProvider as detectEmbedProvider, parseEmbedUrl } from '../embed/providers'

export type SmartReferenceKind =
  | 'issue'
  | 'pull-request'
  | 'design'
  | 'video'
  | 'sandbox'
  | 'social'
  | 'audio'
  | 'link'

export interface SmartReference {
  provider: string
  kind: SmartReferenceKind
  url: string
  refId: string
  title: string
  subtitle?: string
  icon: string
  embedUrl?: string
  metadata: Record<string, string>
}

const GITHUB_ISSUE_REGEX = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i
const GITHUB_PR_REGEX = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i

function parseGitHub(url: string): SmartReference | null {
  const issueMatch = url.match(GITHUB_ISSUE_REGEX)
  if (issueMatch) {
    const [, owner, repo, number] = issueMatch
    return {
      provider: 'github',
      kind: 'issue',
      url,
      refId: `${owner}/${repo}#${number}`,
      title: `${repo}#${number}`,
      subtitle: owner,
      icon: 'GH',
      metadata: {
        owner,
        repo,
        number,
        entity: 'issue'
      }
    }
  }

  const prMatch = url.match(GITHUB_PR_REGEX)
  if (prMatch) {
    const [, owner, repo, number] = prMatch
    return {
      provider: 'github',
      kind: 'pull-request',
      url,
      refId: `${owner}/${repo}#${number}`,
      title: `${repo} PR #${number}`,
      subtitle: owner,
      icon: 'PR',
      metadata: {
        owner,
        repo,
        number,
        entity: 'pull-request'
      }
    }
  }

  return null
}

function inferKind(provider: string): SmartReferenceKind {
  switch (provider) {
    case 'figma':
      return 'design'
    case 'youtube':
    case 'vimeo':
    case 'loom':
      return 'video'
    case 'codesandbox':
      return 'sandbox'
    case 'spotify':
      return 'audio'
    case 'twitter':
      return 'social'
    default:
      return 'link'
  }
}

function buildEmbedReference(url: string): SmartReference | null {
  const provider = detectEmbedProvider(url)
  const parsed = parseEmbedUrl(url)
  if (!provider || !parsed) return null

  const refId = parsed.id
  const label =
    provider.name === 'figma'
      ? `Figma ${refId.split('/')[0]}`
      : provider.name === 'youtube'
        ? `YouTube ${refId}`
        : provider.name === 'loom'
          ? `Loom ${refId.slice(0, 8)}`
          : provider.name === 'codesandbox'
            ? `Sandbox ${refId}`
            : provider.displayName

  return {
    provider: provider.name,
    kind: inferKind(provider.name),
    url,
    refId,
    title: label,
    subtitle: provider.displayName,
    icon: provider.icon,
    embedUrl: parsed.embedUrl,
    metadata: {
      embedProvider: provider.name,
      embedId: refId
    }
  }
}

export function parseSmartReferenceUrl(url: string): SmartReference | null {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null

  return parseGitHub(trimmed) ?? buildEmbedReference(trimmed)
}
