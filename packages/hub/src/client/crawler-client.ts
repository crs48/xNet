/**
 * @xnet/hub - Reference crawler client.
 */

import type { CrawlResult, CrawlTask } from '../services/crawl'

export const XNET_CRAWLER_UA = 'xNetCrawler/1.0 (+https://xnet.io/crawler)'

export class XNetCrawler {
  constructor(
    private hubUrl: string,
    private did: string,
    private token?: string
  ) {}

  async register(profile: {
    type: 'browser' | 'desktop' | 'server'
    capacity: number
    languages: string[]
    domains?: string[]
  }): Promise<void> {
    await this.request('/crawl/register', {
      method: 'POST',
      body: JSON.stringify({ did: this.did, ...profile })
    })
  }

  async getNextTasks(limit = 5): Promise<CrawlTask[]> {
    const response = await this.request(
      `/crawl/next?did=${encodeURIComponent(this.did)}&limit=${limit}`
    )
    const data = (await response.json()) as { tasks?: CrawlTask[] }
    return Array.isArray(data.tasks) ? data.tasks : []
  }

  async submitResults(results: CrawlResult[]): Promise<void> {
    await this.request('/crawl/results', {
      method: 'POST',
      body: JSON.stringify(results)
    })
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': XNET_CRAWLER_UA
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }
    return fetch(`${this.hubUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) }
    })
  }
}
