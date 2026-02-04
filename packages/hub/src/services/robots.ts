/**
 * @xnet/hub - Robots.txt checker with caching.
 */

export type RobotsConfig = {
  userAgent: string
  cacheTtlMs: number
}

type RobotsCacheEntry = {
  expiresAt: number
  disallow: string[]
}

export class RobotsChecker {
  private cache = new Map<string, RobotsCacheEntry>()

  constructor(private config: RobotsConfig) {}

  async isAllowed(url: string): Promise<boolean> {
    const parsed = new URL(url)
    const rules = await this.getRules(parsed.origin)
    if (rules.length === 0) return true
    return !rules.some((rule) => rule !== '/' && parsed.pathname.startsWith(rule))
  }

  private async getRules(origin: string): Promise<string[]> {
    const cached = this.cache.get(origin)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.disallow
    }

    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': this.config.userAgent }
      })
      if (!response.ok) {
        this.cache.set(origin, { expiresAt: Date.now() + this.config.cacheTtlMs, disallow: [] })
        return []
      }

      const text = await response.text()
      const rules = this.parseRobots(text)
      this.cache.set(origin, { expiresAt: Date.now() + this.config.cacheTtlMs, disallow: rules })
      return rules
    } catch {
      this.cache.set(origin, { expiresAt: Date.now() + this.config.cacheTtlMs, disallow: [] })
      return []
    }
  }

  private parseRobots(content: string): string[] {
    const lines = content.split(/\r?\n/)
    let active = false
    const disallow: string[] = []

    for (const raw of lines) {
      const line = raw.split('#')[0]?.trim()
      if (!line) continue
      const [key, ...rest] = line.split(':')
      const value = rest.join(':').trim()

      if (key.toLowerCase() === 'user-agent') {
        const agent = value.toLowerCase()
        active = agent === '*' || agent === this.config.userAgent.toLowerCase()
        continue
      }

      if (active && key.toLowerCase() === 'disallow') {
        if (value.length > 0) {
          disallow.push(value)
        }
      }
    }

    return disallow
  }
}
