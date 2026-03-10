/**
 * Screen Reader Announcer
 *
 * Provides screen reader announcements for canvas state changes.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Node info for announcements
 */
export interface AnnouncerNode {
  type: string
  properties?: {
    title?: string
    locked?: boolean
    [key: string]: unknown
  }
}

// ─── Node Type Labels ──────────────────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<string, string> = {
  page: 'Page',
  note: 'Note',
  card: 'Card',
  document: 'Document',
  database: 'Database',
  'external-reference': 'Link preview',
  media: 'Media asset',
  mermaid: 'Diagram',
  embed: 'Embedded content',
  shape: 'Shape',
  frame: 'Frame',
  group: 'Group',
  checklist: 'Checklist',
  swimlane: 'Swimlane'
}

function getNodeTypeLabel(type: string): string {
  return NODE_TYPE_LABELS[type] ?? 'Node'
}

// ─── Announcer ─────────────────────────────────────────────────────────────────

/**
 * Screen reader announcer.
 */
export class Announcer {
  private liveRegion: HTMLElement | null = null
  private assertiveRegion: HTMLElement | null = null

  constructor() {
    if (typeof document !== 'undefined') {
      this.liveRegion = this.createLiveRegion('polite')
      this.assertiveRegion = this.createLiveRegion('assertive')
    }
  }

  /**
   * Create an ARIA live region.
   */
  private createLiveRegion(politeness: 'polite' | 'assertive'): HTMLElement {
    const region = document.createElement('div')
    region.setAttribute('role', 'status')
    region.setAttribute('aria-live', politeness)
    region.setAttribute('aria-atomic', 'true')
    region.className = 'sr-only'
    region.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `
    document.body.appendChild(region)
    return region
  }

  /**
   * Announce a message politely (waits for current speech).
   */
  announce(message: string): void {
    if (!this.liveRegion) return

    // Clear and set to trigger announcement
    this.liveRegion.textContent = ''
    requestAnimationFrame(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = message
      }
    })
  }

  /**
   * Announce a message assertively (interrupts current speech).
   */
  announceAssertive(message: string): void {
    if (!this.assertiveRegion) return

    this.assertiveRegion.textContent = ''
    requestAnimationFrame(() => {
      if (this.assertiveRegion) {
        this.assertiveRegion.textContent = message
      }
    })
  }

  /**
   * Announce node focus.
   */
  announceNodeFocus(node: AnnouncerNode): void {
    const type = getNodeTypeLabel(node.type)
    const title = node.properties?.title ?? 'Untitled'
    const locked = node.properties?.locked ? ', locked' : ''
    this.announce(`${type}: ${title}${locked}`)
  }

  /**
   * Announce selection change.
   */
  announceSelection(count: number): void {
    if (count === 0) {
      this.announce('Selection cleared')
    } else if (count === 1) {
      this.announce('1 node selected')
    } else {
      this.announce(`${count} nodes selected`)
    }
  }

  /**
   * Announce canvas statistics.
   */
  announceCanvasStats(nodeCount: number, edgeCount: number): void {
    this.announce(`Canvas with ${nodeCount} nodes and ${edgeCount} connections`)
  }

  /**
   * Announce zoom level.
   */
  announceZoom(zoomPercent: number): void {
    this.announce(`Zoom ${Math.round(zoomPercent)}%`)
  }

  /**
   * Announce an error.
   */
  announceError(message: string): void {
    this.announceAssertive(`Error: ${message}`)
  }

  /**
   * Clean up live regions.
   */
  destroy(): void {
    this.liveRegion?.remove()
    this.assertiveRegion?.remove()
    this.liveRegion = null
    this.assertiveRegion = null
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an announcer.
 */
export function createAnnouncer(): Announcer {
  return new Announcer()
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let globalAnnouncer: Announcer | null = null

/**
 * Get the global announcer instance.
 */
export function getAnnouncer(): Announcer {
  if (!globalAnnouncer) {
    globalAnnouncer = new Announcer()
  }
  return globalAnnouncer
}
