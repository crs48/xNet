/**
 * Declarative matcher for xnet:// resource URIs.
 *
 * Routes are registered as URI templates — `xnet://page/{pageId}.md`,
 * `xnet://database/{databaseId}/schema` — and resolved in registration order.
 * A template segment is either a literal or a `{param}` placeholder with an
 * optional literal suffix (the `.md` case); query strings never participate
 * in matching and are handed to the handler as `URLSearchParams`.
 */

import type { AiResourceContent } from '../service'

export type AiResourceRouteMatch = {
  /** The original URI as requested (echoed into responses). */
  uri: string
  /** Values captured by `{param}` template placeholders, URI-decoded. */
  params: Record<string, string>
  searchParams: URLSearchParams
}

export type AiResourceRouteHandler<THost> = (
  host: THost,
  match: AiResourceRouteMatch
) => Promise<AiResourceContent>

export type AiResourceRouter<THost> = {
  register(template: string, handler: AiResourceRouteHandler<THost>): AiResourceRouter<THost>
  /**
   * Resolve a URI against the registered routes. Throws
   * `Invalid xNet resource URI: …` for non-`xnet:` URIs and
   * `Resource not found: …` when no route matches.
   */
  resolve(host: THost, uri: string): Promise<AiResourceContent>
}

type CompiledSegment =
  | { kind: 'literal'; value: string }
  | { kind: 'param'; name: string; suffix: string }

type CompiledRoute<THost> = {
  host: string
  segments: CompiledSegment[]
  handler: AiResourceRouteHandler<THost>
}

const XNET_URI_PREFIX = 'xnet://'
const PARAM_SEGMENT_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9]*)\}(.*)$/

export function createAiResourceRouter<THost>(): AiResourceRouter<THost> {
  const routes: CompiledRoute<THost>[] = []

  const router: AiResourceRouter<THost> = {
    register(template, handler) {
      routes.push(compileRoute(template, handler))
      return router
    },
    async resolve(host, uri) {
      const parsed = parseXNetUri(uri)
      for (const route of routes) {
        const params = matchRoute(route, parsed)
        if (params) {
          return await route.handler(host, { uri, params, searchParams: parsed.searchParams })
        }
      }
      throw new Error(`Resource not found: ${uri}`)
    }
  }

  return router
}

export function parseXNetUri(uri: string): {
  host: string
  parts: string[]
  searchParams: URLSearchParams
} {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new Error(`Invalid xNet resource URI: ${uri}`)
  }
  if (parsed.protocol !== 'xnet:') {
    throw new Error(`Invalid xNet resource URI: ${uri}`)
  }
  return {
    host: parsed.hostname,
    parts: parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part)),
    searchParams: parsed.searchParams
  }
}

function compileRoute<THost>(
  template: string,
  handler: AiResourceRouteHandler<THost>
): CompiledRoute<THost> {
  if (!template.startsWith(XNET_URI_PREFIX)) {
    throw new Error(`Resource route template must start with ${XNET_URI_PREFIX}: ${template}`)
  }
  const [path] = template.slice(XNET_URI_PREFIX.length).split('?')
  const [host, ...rawSegments] = path.split('/').filter(Boolean)
  if (!host) {
    throw new Error(`Resource route template must include a host: ${template}`)
  }

  return {
    host,
    segments: rawSegments.map((segment) => {
      const param = PARAM_SEGMENT_PATTERN.exec(segment)
      return param
        ? { kind: 'param' as const, name: param[1], suffix: param[2] }
        : { kind: 'literal' as const, value: segment }
    }),
    handler
  }
}

function matchRoute<THost>(
  route: CompiledRoute<THost>,
  parsed: { host: string; parts: string[] }
): Record<string, string> | null {
  if (parsed.host !== route.host) return null
  if (parsed.parts.length !== route.segments.length) return null

  const params: Record<string, string> = {}
  for (const [index, segment] of route.segments.entries()) {
    const part = parsed.parts[index]
    if (segment.kind === 'literal') {
      if (part !== segment.value) return null
      continue
    }
    if (segment.suffix && !part.endsWith(segment.suffix)) return null
    params[segment.name] = segment.suffix ? part.slice(0, -segment.suffix.length) : part
  }

  return params
}
